package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"importanttracker/backend/internal/logging"
	"importanttracker/backend/internal/model"
)

type Client struct {
	botToken string
	baseURL  string
	http     *http.Client
}

type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	MessageID int64  `json:"message_id"`
	Text      string `json:"text"`
	Chat      struct {
		ID int64 `json:"id"`
	} `json:"chat"`
}

func NewClient(botToken, baseURL string, timeout time.Duration) *Client {
	return &Client{
		botToken: botToken,
		baseURL:  strings.TrimRight(baseURL, "/"),
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) SendCaptureSummary(ctx context.Context, chatID string, record model.CaptureRecord) error {
	if chatID == "" {
		return nil
	}

	tag := strings.ToLower(strings.TrimSpace(record.Tag))
	message := ""
	if tag == "event" {
		message = fmt.Sprintf("Added to [event] Tag\n%s", record.Summary)
	} else {
		message = fmt.Sprintf("Saved [%s]\n%s", record.Tag, record.Summary)
	}

	return c.SendTextMessage(ctx, chatID, message)
}

func (c *Client) SendTextMessage(ctx context.Context, chatID, text string) error {
	if chatID == "" {
		return nil
	}

	logger := logging.FromContext(ctx).With(
		slog.String("provider", "telegram"),
		slog.String("chat_id", logging.MaskChatID(chatID)),
	)
	startedAt := time.Now()
	logger.Info("telegram_send_message_started")

	payload := map[string]any{
		"chat_id": chatID,
		"text":    text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		logger.Error("telegram_send_message_build_failed", slog.String("error", err.Error()))
		return err
	}

	url := fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL, c.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		logger.Error("telegram_send_message_build_failed", slog.String("error", err.Error()))
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		logger.Error("telegram_send_message_failed", slog.String("error", err.Error()), slog.Duration("duration", time.Since(startedAt)))
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		logger.Error("telegram_send_message_rejected", slog.Int("status", resp.StatusCode), slog.Duration("duration", time.Since(startedAt)))
		return fmt.Errorf("telegram sendMessage failed with status %d", resp.StatusCode)
	}

	logger.Info("telegram_send_message_completed", slog.Int("status", resp.StatusCode), slog.Duration("duration", time.Since(startedAt)))
	return nil
}

func (c *Client) GetBotUsername(ctx context.Context) (string, error) {
	logger := logging.FromContext(ctx).With(slog.String("provider", "telegram"))
	startedAt := time.Now()
	logger.Info("telegram_get_me_started")
	url := fmt.Sprintf("%s/bot%s/getMe", c.baseURL, c.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		logger.Error("telegram_get_me_build_failed", slog.String("error", err.Error()))
		return "", err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		logger.Error("telegram_get_me_failed", slog.String("error", err.Error()), slog.Duration("duration", time.Since(startedAt)))
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		logger.Error("telegram_get_me_rejected", slog.Int("status", resp.StatusCode), slog.Duration("duration", time.Since(startedAt)))
		return "", fmt.Errorf("telegram getMe failed with status %d", resp.StatusCode)
	}

	var parsed struct {
		OK     bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		logger.Error("telegram_get_me_decode_failed", slog.String("error", err.Error()))
		return "", err
	}

	if !parsed.OK {
		logger.Error("telegram_get_me_not_ok")
		return "", fmt.Errorf("telegram getMe returned not ok")
	}

	logger.Info("telegram_get_me_completed", slog.String("bot_username", parsed.Result.Username), slog.Duration("duration", time.Since(startedAt)))
	return parsed.Result.Username, nil
}

func (c *Client) GetUpdates(ctx context.Context, offset int64, timeoutSeconds int) ([]Update, int64, error) {
	logger := logging.FromContext(ctx).With(
		slog.String("provider", "telegram"),
		slog.Int64("offset", offset),
		slog.Int("timeout_seconds", timeoutSeconds),
	)
	startedAt := time.Now()
	url := fmt.Sprintf(
		"%s/bot%s/getUpdates?offset=%d&timeout=%d",
		c.baseURL,
		c.botToken,
		offset,
		timeoutSeconds,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		logger.Error("telegram_get_updates_build_failed", slog.String("error", err.Error()))
		return nil, offset, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		logger.Error("telegram_get_updates_failed", slog.String("error", err.Error()), slog.Duration("duration", time.Since(startedAt)))
		return nil, offset, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		logger.Error("telegram_get_updates_rejected", slog.Int("status", resp.StatusCode), slog.Duration("duration", time.Since(startedAt)))
		return nil, offset, fmt.Errorf("telegram getUpdates failed with status %d", resp.StatusCode)
	}

	var parsed struct {
		OK     bool     `json:"ok"`
		Result []Update `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		logger.Error("telegram_get_updates_decode_failed", slog.String("error", err.Error()))
		return nil, offset, err
	}
	if !parsed.OK {
		logger.Error("telegram_get_updates_not_ok")
		return nil, offset, fmt.Errorf("telegram getUpdates returned not ok")
	}

	nextOffset := offset
	for _, update := range parsed.Result {
		if update.UpdateID >= nextOffset {
			nextOffset = update.UpdateID + 1
		}
	}

	logger.Info("telegram_get_updates_completed", slog.Int("update_count", len(parsed.Result)), slog.Int64("next_offset", nextOffset), slog.Duration("duration", time.Since(startedAt)))
	return parsed.Result, nextOffset, nil
}

func ChatIDToString(chatID int64) string {
	return strconv.FormatInt(chatID, 10)
}
