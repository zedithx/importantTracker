package logging

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"os"
	"strings"
)

type Config struct {
	AppEnv string
	Level  string
	Format string
}

type contextKey string

const (
	loggerContextKey    contextKey = "logger"
	requestIDContextKey contextKey = "request_id"
)

func New(cfg Config) *slog.Logger {
	level := parseLevel(cfg.Level)
	opts := &slog.HandlerOptions{
		Level:     level,
		AddSource: !isProductionEnv(cfg.AppEnv),
	}

	format := strings.ToLower(strings.TrimSpace(cfg.Format))
	if format == "" || format == "auto" {
		if isProductionEnv(cfg.AppEnv) {
			format = "json"
		} else {
			format = "text"
		}
	}

	var handler slog.Handler
	switch format {
	case "json":
		handler = slog.NewJSONHandler(os.Stdout, opts)
	default:
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	return slog.New(handler)
}

func SetDefault(logger *slog.Logger) {
	if logger == nil {
		return
	}
	slog.SetDefault(logger)
}

func Logger() *slog.Logger {
	return slog.Default()
}

func ContextWithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if logger == nil {
		logger = Logger()
	}
	return context.WithValue(ctx, loggerContextKey, logger)
}

func FromContext(ctx context.Context) *slog.Logger {
	if ctx != nil {
		if logger, ok := ctx.Value(loggerContextKey).(*slog.Logger); ok && logger != nil {
			return logger
		}
	}
	return Logger()
}

func ContextWithRequestID(ctx context.Context, requestID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, requestIDContextKey, strings.TrimSpace(requestID))
}

func RequestID(ctx context.Context) string {
	if ctx != nil {
		if requestID, ok := ctx.Value(requestIDContextKey).(string); ok {
			return strings.TrimSpace(requestID)
		}
	}
	return ""
}

func NewRequestID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "req_fallback"
	}
	return "req_" + hex.EncodeToString(buf)
}

func MaskEmail(raw string) string {
	email := strings.TrimSpace(raw)
	if email == "" {
		return ""
	}

	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" || domain == "" {
		return "***"
	}

	if len(local) == 1 {
		return local + "***@" + domain
	}
	return local[:1] + "***@" + domain
}

func MaskChatID(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if len(value) <= 4 {
		return "***" + value
	}
	return "***" + value[len(value)-4:]
}

func HTTPLevel(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func isProductionEnv(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "production", "prod":
		return true
	default:
		return false
	}
}
