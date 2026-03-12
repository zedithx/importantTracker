package main

import (
	"log/slog"
	"net/url"
	"os"
	"strings"

	"importanttracker/backend/internal/config"
	"importanttracker/backend/internal/logging"
	"importanttracker/backend/internal/store"
)

func main() {
	config.LoadEnvFilesIfPresent(".env", "../.env")

	logger := logging.New(logging.Config{
		AppEnv: envOrDefault("APP_ENV", "development"),
		Level:  envOrDefault("LOG_LEVEL", "info"),
		Format: envOrDefault("LOG_FORMAT", "auto"),
	})
	logging.SetDefault(logger)

	dsn := strings.TrimSpace(firstEnv("DATABASE_URL", "POSTGRES_DSN"))
	if dsn == "" {
		slog.Error("migration_dsn_missing", slog.String("hint", "set DATABASE_URL or POSTGRES_DSN"))
		os.Exit(1)
	}

	slog.Info("migration_starting", slog.String("target", summarizeDSN(dsn)))
	if err := store.RunPostgresMigrations(dsn); err != nil {
		slog.Error("migration_failed", slog.String("target", summarizeDSN(dsn)), slog.String("error", err.Error()))
		os.Exit(1)
	}
	slog.Info("migration_completed", slog.String("target", summarizeDSN(dsn)))
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func summarizeDSN(dsn string) string {
	parsed, err := url.Parse(strings.TrimSpace(dsn))
	if err != nil || parsed.Host == "" {
		return "postgres"
	}

	database := strings.TrimPrefix(parsed.Path, "/")
	if database == "" {
		database = "postgres"
	}

	return parsed.Host + "/" + database
}
