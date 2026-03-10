package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"importanttracker/backend/internal/ai"
	"importanttracker/backend/internal/config"
	"importanttracker/backend/internal/model"
	"importanttracker/backend/internal/service"
	"importanttracker/backend/internal/store"
	"importanttracker/backend/internal/telegram"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	captureStore, cleanupStore := initCaptureStore(cfg)
	if cleanupStore != nil {
		defer cleanupStore()
	}

	aiClient := ai.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAIBaseURL, cfg.RequestTimeout)
	tgClient := telegram.NewClient(cfg.TelegramBotToken, cfg.TelegramAPIBaseURL, cfg.RequestTimeout)
	svc := service.New(aiClient, captureStore, tgClient, cfg.TelegramDefaultChatID)

	botUsername := ""
	ctx, cancel := context.WithTimeout(context.Background(), cfg.RequestTimeout)
	botUsername, err = tgClient.GetBotUsername(ctx)
	cancel()
	if err != nil {
		log.Printf("telegram getMe failed: %v", err)
	}

	startTelegramLinkWatcher(tgClient, svc)

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("/v1/captures", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		var in model.CaptureInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
		defer cancel()

		record, warning, err := svc.ProcessCapture(ctx, in)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		resp := map[string]any{
			"capture_id":  record.ID,
			"summary":     record.Summary,
			"tag":         record.Tag,
			"fields":      record.Fields,
			"captured_at": record.CapturedAt,
		}
		if warning != "" {
			resp["warning"] = warning
		}

		writeJSON(w, http.StatusOK, resp)
	})

	mux.HandleFunc("/v1/query", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		var in model.QueryInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
		defer cancel()

		answer, err := svc.AnswerQuestion(ctx, in)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, answer)
	})

	mux.HandleFunc("/v1/integrations/telegram/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		var in model.TelegramLinkStartInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		link, err := svc.StartTelegramLink(in.UserID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"event_id":     link.EventID,
			"user_id":      link.UserID,
			"status":       link.Status,
			"created_at":   link.CreatedAt,
			"bot_username": botUsername,
		})
	})

	mux.HandleFunc("/v1/integrations/telegram/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		eventID := r.URL.Query().Get("event_id")
		link, err := svc.GetTelegramLinkStatus(eventID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, link)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      withCORS(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("SnapRecall backend running on %s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server failed: %v", err)
	}
}

func initCaptureStore(cfg *config.Config) (service.CaptureStore, func()) {
	dsn := strings.TrimSpace(cfg.PostgresDSN)
	if dsn == "" {
		log.Printf("storage: using in-memory store")
		return store.NewMemoryStore(), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pgStore, err := store.NewPostgresStore(
		ctx,
		dsn,
		cfg.PostgresMaxOpenConns,
		cfg.PostgresMaxIdleConns,
		cfg.PostgresConnMaxLife,
	)
	if err != nil {
		log.Fatalf("storage: failed to initialize postgres store: %v", err)
	}

	log.Printf("storage: using postgres store")
	return pgStore, func() {
		if err := pgStore.Close(); err != nil {
			log.Printf("storage: close postgres store failed: %v", err)
		}
	}
}

func startTelegramLinkWatcher(tgClient *telegram.Client, svc *service.Service) {
	go func() {
		var offset int64 = 0

		for {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			updates, nextOffset, err := tgClient.GetUpdates(ctx, offset, 10)
			cancel()
			if err != nil {
				log.Printf("telegram update poll failed: %v", err)
				time.Sleep(3 * time.Second)
				continue
			}

			offset = nextOffset

			for _, update := range updates {
				if update.Message == nil {
					continue
				}

				text := strings.TrimSpace(update.Message.Text)
				if text == "" {
					continue
				}

				chatID := telegram.ChatIDToString(update.Message.Chat.ID)
				link, linked := svc.TryCompleteTelegramLink(text, chatID)
				if linked {
					reply := fmt.Sprintf(
						"SnapRecall connected successfully for event %s. You can return to the desktop app.",
						link.EventID,
					)
					_ = tgClient.SendTextMessage(context.Background(), chatID, reply)
					continue
				}

				answerCtx, answerCancel := context.WithTimeout(context.Background(), 20*time.Second)
				reply, handled := svc.HandleTelegramQuestion(answerCtx, chatID, text)
				answerCancel()
				if !handled {
					continue
				}

				_ = tgClient.SendTextMessage(context.Background(), chatID, reply)
			}
		}
	}()
}

func decodeJSON(r *http.Request, out any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(out)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
