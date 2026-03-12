package main

import (
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"importanttracker/backend/internal/auth"
	"importanttracker/backend/internal/config"
	"importanttracker/backend/internal/logging"
)

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *responseRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(payload []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	written, err := r.ResponseWriter.Write(payload)
	r.bytes += written
	return written, err
}

func (r *responseRecorder) statusCode() int {
	if r.status == 0 {
		return http.StatusOK
	}
	return r.status
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logging.FromContext(r.Context()).Error(
					"request_panicked",
					slog.Any("panic", recovered),
				)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()

		next.ServeHTTP(w, r)
	})
}

func withRequestLogging(next http.Handler, authManager *auth.Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
		if requestID == "" {
			requestID = logging.NewRequestID()
		}

		recorder := &responseRecorder{ResponseWriter: w}
		recorder.Header().Set("X-Request-Id", requestID)

		logger := slog.Default().With(
			slog.String("request_id", requestID),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("remote_addr", clientAddress(r)),
			slog.Int64("content_length", r.ContentLength),
		)

		if authManager != nil {
			if claims, err := optionalAuthClaims(r, authManager); err == nil && claims != nil {
				logger = logger.With(slog.String("user_id", claims.UserID))
			} else if err != nil {
				logger.Warn("request_auth_parse_failed", slog.String("error", err.Error()))
			}
		}

		ctx := logging.ContextWithRequestID(r.Context(), requestID)
		ctx = logging.ContextWithLogger(ctx, logger)
		r = r.WithContext(ctx)

		startedAt := time.Now()
		logger.Debug("request_started")
		next.ServeHTTP(recorder, r)

		duration := time.Since(startedAt)
		logger.Log(
			ctx,
			logging.HTTPLevel(recorder.statusCode()),
			"request_completed",
			slog.Int("status", recorder.statusCode()),
			slog.Int("response_bytes", recorder.bytes),
			slog.Duration("duration", duration),
		)
	})
}

func clientAddress(r *http.Request) string {
	for _, header := range []string{"X-Forwarded-For", "X-Real-Ip"} {
		raw := strings.TrimSpace(r.Header.Get(header))
		if raw == "" {
			continue
		}
		if header == "X-Forwarded-For" {
			first := strings.TrimSpace(strings.Split(raw, ",")[0])
			if first != "" {
				return first
			}
			continue
		}
		return raw
	}

	host, port, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return net.JoinHostPort(host, port)
	}
	if strings.TrimSpace(r.RemoteAddr) != "" {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return "unknown"
}

func logStartupConfig(cfg *config.Config) {
	slog.Info(
		"backend_config_loaded",
		slog.String("app_env", cfg.AppEnv),
		slog.String("port", cfg.Port),
		slog.String("request_timeout", cfg.RequestTimeout.String()),
		slog.String("ai_request_timeout", cfg.AIRequestTimeout.String()),
		slog.String("openai_model", cfg.OpenAIModel),
		slog.Bool("postgres_enabled", strings.TrimSpace(cfg.PostgresDSN) != ""),
		slog.Bool("telegram_default_chat_configured", strings.TrimSpace(cfg.TelegramDefaultChatID) != ""),
		slog.String("log_level", cfg.LogLevel),
		slog.String("log_format", cfg.LogFormat),
	)
}

func logStorageSelection(driver string, attrs ...slog.Attr) {
	args := []any{slog.String("driver", driver)}
	for _, attr := range attrs {
		args = append(args, attr)
	}
	slog.Info("storage_selected", args...)
}

func connectionSummary(dsn string) string {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return ""
	}

	noProto := dsn
	if idx := strings.Index(noProto, "://"); idx >= 0 {
		noProto = noProto[idx+3:]
	}

	hostPart := noProto
	if idx := strings.Index(hostPart, "/"); idx >= 0 {
		hostPart = hostPart[:idx]
	}
	if idx := strings.LastIndex(hostPart, "@"); idx >= 0 {
		hostPart = hostPart[idx+1:]
	}
	return strings.TrimSpace(hostPart)
}

func formatError(err error) slog.Attr {
	if err == nil {
		return slog.String("error", "")
	}
	return slog.String("error", err.Error())
}

func formatDuration(startedAt time.Time) slog.Attr {
	return slog.Duration("duration", time.Since(startedAt))
}

func formatCount(name string, count int) slog.Attr {
	return slog.Int(fmt.Sprintf("%s_count", strings.TrimSpace(name)), count)
}

func fatalLog(message string, attrs ...any) {
	slog.Error(message, attrs...)
	os.Exit(1)
}
