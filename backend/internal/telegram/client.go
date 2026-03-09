package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"importanttracker/backend/internal/model"
)

type Client struct {
	botToken string
	http     *http.Client
}

func NewClient(botToken string, timeout time.Duration) *Client {
	return &Client{
		botToken: botToken,
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) SendCaptureSummary(ctx context.Context, chatID string, record model.CaptureRecord) error {
	if chatID == "" {
		return nil
	}

	message := fmt.Sprintf(
		"Saved [%s]\n%s\nSource: %s\nCaptured: %s",
		record.Tag,
		record.Summary,
		record.Source.Title,
		record.CapturedAt.Format("2006-01-02 15:04 MST"),
	)

	payload := map[string]any{
		"chat_id": chatID,
		"text":    message,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", c.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram sendMessage failed with status %d", resp.StatusCode)
	}

	return nil
}
