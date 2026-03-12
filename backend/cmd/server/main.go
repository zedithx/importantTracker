package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"importanttracker/backend/internal/ai"
	"importanttracker/backend/internal/auth"
	"importanttracker/backend/internal/config"
	"importanttracker/backend/internal/logging"
	"importanttracker/backend/internal/model"
	"importanttracker/backend/internal/service"
	"importanttracker/backend/internal/store"
	"importanttracker/backend/internal/telegram"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fatalLog("failed_to_load_config", slog.String("error", err.Error()))
	}
	logger := logging.New(logging.Config{
		AppEnv: cfg.AppEnv,
		Level:  cfg.LogLevel,
		Format: cfg.LogFormat,
	})
	logging.SetDefault(logger)
	slog.Info("backend_starting", slog.String("addr", ":"+cfg.Port))
	logStartupConfig(cfg)

	captureStore, cleanupStore := initCaptureStore(cfg)
	if cleanupStore != nil {
		defer cleanupStore()
	}

	aiClient := ai.NewOpenAIClient(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAIBaseURL, cfg.AIRequestTimeout)
	tgClient := telegram.NewClient(cfg.TelegramBotToken, cfg.TelegramAPIBaseURL, cfg.RequestTimeout)
	svc := service.New(aiClient, captureStore, tgClient, cfg.TelegramDefaultChatID)
	authManager, err := auth.NewManager(cfg.AuthJWTSecret, cfg.AuthTokenTTL)
	if err != nil {
		fatalLog("failed_to_initialize_auth_manager", slog.String("error", err.Error()))
	}

	var botUsername atomic.Value
	botUsername.Store("")

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), cfg.RequestTimeout)
		defer cancel()

		username, err := tgClient.GetBotUsername(ctx)
		if err != nil {
			slog.Warn("telegram_get_me_failed", slog.String("error", err.Error()))
			return
		}
		botUsername.Store(username)
		slog.Info("telegram_bot_metadata_loaded", slog.String("bot_username", username))
	}()

	startTelegramLinkWatcher(tgClient, svc)

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("/v1/auth/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		var in model.AuthRegisterInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
		defer cancel()

		user, err := svc.RegisterUser(ctx, in)
		if err != nil {
			status := http.StatusBadRequest
			if strings.Contains(strings.ToLower(err.Error()), "already registered") {
				status = http.StatusConflict
			}
			writeJSON(w, status, map[string]string{"error": err.Error()})
			return
		}

		token, err := authManager.GenerateToken(user.UserID, user.Email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create auth token"})
			return
		}

		writeJSON(w, http.StatusOK, model.AuthResponse{
			Token: token,
			User:  user,
		})
	})

	mux.HandleFunc("/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		var in model.AuthLoginInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
		defer cancel()

		user, err := svc.AuthenticateUser(ctx, in)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		token, err := authManager.GenerateToken(user.UserID, user.Email)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create auth token"})
			return
		}

		writeJSON(w, http.StatusOK, model.AuthResponse{
			Token: token,
			User:  user,
		})
	})

	mux.HandleFunc("/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), cfg.RequestTimeout)
		defer cancel()

		user, err := svc.GetUserProfile(ctx, claims.UserID)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"user": user})
	})

	mux.HandleFunc("/v1/captures", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		var in model.CaptureInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		in.UserID = claims.UserID

		ctx, cancel := context.WithTimeout(r.Context(), cfg.AIRequestTimeout)
		defer cancel()

		record, warning, err := svc.ProcessCapture(ctx, in)
		if err != nil {
			if isTimeoutError(err) {
				writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": "capture analysis timed out; retry or increase AI_REQUEST_TIMEOUT_SECONDS"})
				return
			}
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

	mux.HandleFunc("/v1/captures/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		captureID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/v1/captures/"))
		if captureID == "" || strings.Contains(captureID, "/") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid capture id"})
			return
		}

		deleted, err := svc.DeleteCapture(claims.UserID, captureID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if !deleted {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "capture not found"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"deleted":    true,
			"capture_id": captureID,
		})
	})

	mux.HandleFunc("/v1/captures/recent", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		limit := 20
		if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
			parsed, parseErr := strconv.Atoi(rawLimit)
			if parseErr != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid limit"})
				return
			}
			limit = parsed
		}

		records, err := svc.ListRecentCaptures(claims.UserID, limit)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"captures": records,
		})
	})

	mux.HandleFunc("/v1/query", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		var in model.QueryInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		in.UserID = claims.UserID

		ctx, cancel := context.WithTimeout(r.Context(), cfg.AIRequestTimeout)
		defer cancel()

		answer, err := svc.AnswerQuestion(ctx, in)
		if err != nil {
			if isTimeoutError(err) {
				writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": "query timed out; retry or increase AI_REQUEST_TIMEOUT_SECONDS"})
				return
			}
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

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		var in model.TelegramLinkStartInput
		if err := decodeJSON(r, &in); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		in.UserID = claims.UserID

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
			"bot_username": botUsername.Load(),
		})
	})

	mux.HandleFunc("/v1/integrations/telegram/me", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		status, err := svc.GetTelegramIntegrationStatus(claims.UserID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, status)
	})

	mux.HandleFunc("/v1/integrations/telegram/disconnect", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		disconnected, err := svc.DisconnectTelegramIntegration(claims.UserID)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"disconnected": disconnected,
			"user_id":      claims.UserID,
			"status":       "not_linked",
		})
	})

	mux.HandleFunc("/v1/integrations/telegram/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}

		claims, err := requireAuthClaims(r, authManager)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		eventID := r.URL.Query().Get("event_id")
		link, err := svc.GetTelegramLinkStatus(claims.UserID, eventID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, link)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	writeTimeout := maxDuration(cfg.RequestTimeout, cfg.AIRequestTimeout) + 10*time.Second
	server := &http.Server{
		Addr:         addr,
		Handler:      withRequestLogging(withRecovery(withCORS(mux)), authManager),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: writeTimeout,
		IdleTimeout:  60 * time.Second,
	}

	slog.Info("backend_listening", slog.String("addr", addr))
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatalLog("server_listen_failed", slog.String("error", err.Error()))
	}
}

func initCaptureStore(cfg *config.Config) (service.CaptureStore, func()) {
	dsn := strings.TrimSpace(cfg.PostgresDSN)
	if dsn == "" {
		logStorageSelection("memory")
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
		fatalLog(
			"storage_initialization_failed",
			slog.String("driver", "postgres"),
			slog.String("target", connectionSummary(dsn)),
			slog.String("error", err.Error()),
		)
	}

	logStorageSelection("postgres", slog.String("target", connectionSummary(dsn)))
	return pgStore, func() {
		if err := pgStore.Close(); err != nil {
			slog.Warn("storage_close_failed", slog.String("driver", "postgres"), slog.String("error", err.Error()))
		}
	}
}

func startTelegramLinkWatcher(tgClient *telegram.Client, svc *service.Service) {
	go func() {
		slog.Info("telegram_link_watcher_started")
		var offset int64 = 0

		for {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			updates, nextOffset, err := tgClient.GetUpdates(ctx, offset, 10)
			cancel()
			if err != nil {
				slog.Warn("telegram_update_poll_failed", slog.String("error", err.Error()))
				time.Sleep(3 * time.Second)
				continue
			}

			offset = nextOffset
			if len(updates) > 0 {
				slog.Debug("telegram_updates_received", formatCount("update", len(updates)), slog.Int64("next_offset", nextOffset))
			}

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
					slog.Info("telegram_link_completed", slog.String("event_id", link.EventID), slog.String("chat_id", logging.MaskChatID(chatID)))
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

				slog.Info("telegram_question_handled", slog.String("chat_id", logging.MaskChatID(chatID)))
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
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func optionalAuthClaims(r *http.Request, authManager *auth.Manager) (*auth.Claims, error) {
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return nil, nil
	}

	claims, err := authManager.ParseToken(token)
	if err != nil {
		return nil, fmt.Errorf("invalid auth token")
	}
	return &claims, nil
}

func requireAuthClaims(r *http.Request, authManager *auth.Manager) (auth.Claims, error) {
	token := extractBearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return auth.Claims{}, fmt.Errorf("authorization required")
	}

	claims, err := authManager.ParseToken(token)
	if err != nil {
		return auth.Claims{}, fmt.Errorf("invalid auth token")
	}
	return claims, nil
}

func extractBearerToken(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}

	const prefix = "bearer "
	if strings.HasPrefix(strings.ToLower(value), prefix) {
		return strings.TrimSpace(value[len(prefix):])
	}
	return ""
}

func isTimeoutError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func maxDuration(a, b time.Duration) time.Duration {
	if a >= b {
		return a
	}
	return b
}
