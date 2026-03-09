package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
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

	captureStore := store.NewMemoryStore()
	aiClient := ai.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAIBaseURL, cfg.RequestTimeout)
	tgClient := telegram.NewClient(cfg.TelegramBotToken, cfg.RequestTimeout)
	svc := service.New(aiClient, captureStore, tgClient, cfg.TelegramDefaultChatID)

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

	addr := fmt.Sprintf(":%s", cfg.Port)
	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("SnapRecall backend running on %s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server failed: %v", err)
	}
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
