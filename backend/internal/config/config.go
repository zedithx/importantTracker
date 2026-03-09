package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppEnv                string
	Port                  string
	RequestTimeout        time.Duration
	DataDir               string
	OpenAIAPIKey          string
	OpenAIModel           string
	OpenAIBaseURL         string
	TelegramBotToken      string
	TelegramDefaultChatID string
	EncryptionKey         string
}

func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:                getOrDefault("APP_ENV", "development"),
		Port:                  getOrDefault("APP_PORT", "8080"),
		RequestTimeout:        time.Duration(getIntOrDefault("REQUEST_TIMEOUT_SECONDS", 20)) * time.Second,
		DataDir:               getOrDefault("DATA_DIR", "./data"),
		OpenAIAPIKey:          os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:           getOrDefault("OPENAI_MODEL", "gpt-4.1-mini"),
		OpenAIBaseURL:         getOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		TelegramBotToken:      os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramDefaultChatID: os.Getenv("TELEGRAM_DEFAULT_CHAT_ID"),
		EncryptionKey:         os.Getenv("ENCRYPTION_KEY"),
	}

	if cfg.OpenAIAPIKey == "" {
		return nil, fmt.Errorf("missing OPENAI_API_KEY")
	}
	if cfg.TelegramBotToken == "" {
		return nil, fmt.Errorf("missing TELEGRAM_BOT_TOKEN")
	}

	return cfg, nil
}

func getOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
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
