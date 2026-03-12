package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv                string
	LogLevel              string
	LogFormat             string
	Port                  string
	RequestTimeout        time.Duration
	AIRequestTimeout      time.Duration
	DataDir               string
	PostgresDSN           string
	PostgresMaxOpenConns  int
	PostgresMaxIdleConns  int
	PostgresConnMaxLife   time.Duration
	OpenAIAPIKey          string
	OpenAIModel           string
	OpenAIBaseURL         string
	TelegramBotToken      string
	TelegramAPIBaseURL    string
	TelegramDefaultChatID string
	AuthJWTSecret         string
	AuthTokenTTL          time.Duration
	EncryptionKey         string
}

func Load() (*Config, error) {
	LoadEnvFilesIfPresent(".env", "../.env")

	cfg := &Config{
		AppEnv:                getOrDefault("APP_ENV", "development"),
		LogLevel:              getOrDefault("LOG_LEVEL", "info"),
		LogFormat:             getOrDefault("LOG_FORMAT", "auto"),
		Port:                  getOrDefault("APP_PORT", "8080"),
		RequestTimeout:        time.Duration(getIntOrDefault("REQUEST_TIMEOUT_SECONDS", 20)) * time.Second,
		AIRequestTimeout:      time.Duration(getIntOrDefault("AI_REQUEST_TIMEOUT_SECONDS", 60)) * time.Second,
		DataDir:               getOrDefault("DATA_DIR", "./data"),
		PostgresDSN:           getFirstEnv("DATABASE_URL", "POSTGRES_DSN"),
		PostgresMaxOpenConns:  getIntOrDefault("POSTGRES_MAX_OPEN_CONNS", 10),
		PostgresMaxIdleConns:  getIntOrDefault("POSTGRES_MAX_IDLE_CONNS", 5),
		PostgresConnMaxLife:   time.Duration(getIntOrDefault("POSTGRES_CONN_MAX_LIFETIME_MINUTES", 30)) * time.Minute,
		OpenAIAPIKey:          os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:           getOrDefault("OPENAI_MODEL", "gpt-4.1-mini"),
		OpenAIBaseURL:         getOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		TelegramBotToken:      os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramAPIBaseURL:    getOrDefault("TELEGRAM_API_BASE_URL", "https://api.telegram.org"),
		TelegramDefaultChatID: os.Getenv("TELEGRAM_DEFAULT_CHAT_ID"),
		AuthJWTSecret:         os.Getenv("AUTH_JWT_SECRET"),
		AuthTokenTTL:          time.Duration(getIntOrDefault("AUTH_TOKEN_TTL_HOURS", 24*30)) * time.Hour,
		EncryptionKey:         os.Getenv("ENCRYPTION_KEY"),
	}

	if cfg.OpenAIAPIKey == "" {
		return nil, fmt.Errorf("missing OPENAI_API_KEY")
	}
	if cfg.TelegramBotToken == "" {
		return nil, fmt.Errorf("missing TELEGRAM_BOT_TOKEN")
	}
	if cfg.AuthJWTSecret == "" {
		return nil, fmt.Errorf("missing AUTH_JWT_SECRET")
	}

	return cfg, nil
}

func LoadEnvFilesIfPresent(paths ...string) {
	loadDotEnvIfPresent(paths...)
}

func getOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getFirstEnv(keys ...string) string {
	for _, key := range keys {
		if v := os.Getenv(key); v != "" {
			return v
		}
	}
	return ""
}

func getIntOrDefault(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}

func loadDotEnvIfPresent(paths ...string) {
	for _, p := range paths {
		if err := loadDotEnvFile(p); err == nil {
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			// Non-fatal: keep startup resilient even if dotenv parsing fails.
			return
		}
	}
}

func loadDotEnvFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" {
			continue
		}

		if unquoted, err := strconv.Unquote(value); err == nil {
			value = unquoted
		}

		if _, exists := os.LookupEnv(key); exists {
			continue
		}

		_ = os.Setenv(key, value)
	}

	return nil
}
