package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"importanttracker/backend/internal/logging"
	"importanttracker/backend/internal/model"
)

type OpenAIClient struct {
	apiKey  string
	model   string
	baseURL string
	http    *http.Client
}

type CaptureAnalysis struct {
	Summary string        `json:"summary"`
	Tag     string        `json:"tag"`
	Fields  []model.Field `json:"fields"`
	OCRText string        `json:"ocr_text"`
}

type message struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type contentPart struct {
	Type     string     `json:"type"`
	Text     string     `json:"text,omitempty"`
	ImageURL *imageLink `json:"image_url,omitempty"`
}

type imageLink struct {
	URL string `json:"url"`
}

func NewOpenAIClient(apiKey, modelName, baseURL string, timeout time.Duration) *OpenAIClient {
	return &OpenAIClient{
		apiKey:  apiKey,
		model:   modelName,
		baseURL: strings.TrimRight(baseURL, "/"),
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *OpenAIClient) AnalyzeCapture(ctx context.Context, ocrText, imageBase64, tagHint string) (CaptureAnalysis, error) {
	if strings.TrimSpace(ocrText) == "" && strings.TrimSpace(imageBase64) == "" {
		return CaptureAnalysis{}, fmt.Errorf("ocr text or image is required")
	}

	var out CaptureAnalysis

	system := `You extract high-value facts from OCR text and screenshots.
Return JSON only with keys: summary, tag, fields, ocr_text.
- summary: one concise sentence.
- tag: one of exam, flight, event, other.
- fields: array of {type, value, confidence}.
- confidence is float 0..1.
- ocr_text: plain extracted text if available.
- Prioritize date, time, location, ticket_number, booking_reference, flight_number.`

	var user any
	if strings.TrimSpace(imageBase64) != "" {
		parts := []contentPart{
			{
				Type: "text",
				Text: fmt.Sprintf("tag_hint: %s\nExtract key facts from this screenshot.", tagHint),
			},
			{
				Type: "image_url",
				ImageURL: &imageLink{
					URL: normalizeImageDataURL(imageBase64),
				},
			},
		}
		if strings.TrimSpace(ocrText) != "" {
			parts = append(parts, contentPart{
				Type: "text",
				Text: "Additional OCR text:\n" + ocrText,
			})
		}
		user = parts
	} else {
		user = fmt.Sprintf("tag_hint: %s\nocr_text:\n%s", tagHint, ocrText)
	}

	if err := c.chatJSON(ctx, system, user, &out); err != nil {
		return CaptureAnalysis{}, err
	}

	if out.Summary == "" {
		out.Summary = "Captured important information."
	}
	if out.Tag == "" {
		out.Tag = "other"
	}
	if strings.TrimSpace(out.OCRText) == "" && strings.TrimSpace(ocrText) != "" {
		out.OCRText = ocrText
	}

	return out, nil
}

func (c *OpenAIClient) AnswerQuestion(ctx context.Context, question string, captures []model.CaptureRecord) (model.QueryAnswer, error) {
	type captureView struct {
		ID         string        `json:"id"`
		CapturedAt time.Time     `json:"captured_at"`
		Summary    string        `json:"summary"`
		Tag        string        `json:"tag"`
		Fields     []model.Field `json:"fields"`
		OCRText    string        `json:"ocr_text"`
	}

	views := make([]captureView, 0, len(captures))
	for _, c := range captures {
		views = append(views, captureView{
			ID:         c.ID,
			CapturedAt: c.CapturedAt,
			Summary:    c.Summary,
			Tag:        c.Tag,
			Fields:     c.Fields,
			OCRText:    c.OCRText,
		})
	}

	ctxJSON, _ := json.Marshal(views)

	system := `You answer factual recall questions only from provided capture data.
Return JSON only with keys: answer, source_capture_id, confidence.
Rules:
- If information cannot be verified, answer "I cannot verify this from your saved captures.", leave source_capture_id empty, and confidence <= 0.35.
- Include concrete facts only if they exist in fields/summary/ocr_text.
- Keep answer concise.`

	user := fmt.Sprintf("question: %s\ncaptures_json: %s", question, string(ctxJSON))

	var out model.QueryAnswer
	if err := c.chatJSON(ctx, system, user, &out); err != nil {
		return model.QueryAnswer{}, err
	}

	if out.Answer == "" {
		out.Answer = "I cannot verify this from your saved captures."
		out.Confidence = 0.3
	}

	return out, nil
}

func (c *OpenAIClient) chatJSON(ctx context.Context, system string, user any, out any) error {
	type request struct {
		Model          string    `json:"model"`
		Messages       []message `json:"messages"`
		Temperature    float64   `json:"temperature"`
		ResponseFormat any       `json:"response_format"`
	}

	reqBody := request{
		Model: c.model,
		Messages: []message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Temperature: 0.1,
		ResponseFormat: map[string]string{
			"type": "json_object",
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		logging.FromContext(ctx).Error("openai_request_build_failed", slog.String("error", err.Error()))
		return err
	}

	logger := logging.FromContext(ctx).With(
		slog.String("provider", "openai"),
		slog.String("model", c.model),
		slog.String("endpoint", c.baseURL+"/chat/completions"),
		slog.Int("payload_bytes", len(payload)),
	)
	startedAt := time.Now()
	logger.Info("openai_request_started")

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		logger.Error("openai_request_build_failed", slog.String("error", err.Error()))
		return err
	}

	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		logger.Error("openai_request_failed", slog.String("error", err.Error()), slog.Duration("duration", time.Since(startedAt)))
		if errors.Is(err, context.DeadlineExceeded) {
			return fmt.Errorf("openai request timed out: %w", err)
		}
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return fmt.Errorf("openai request timed out: %w", err)
		}
		return err
	}
	defer resp.Body.Close()
	logger.Info("openai_response_received", slog.Int("status", resp.StatusCode), slog.Duration("duration", time.Since(startedAt)))

	if resp.StatusCode >= 300 {
		return fmt.Errorf("openai chat completion failed with status %d", resp.StatusCode)
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		logger.Error("openai_response_decode_failed", slog.String("error", err.Error()))
		return err
	}

	if len(parsed.Choices) == 0 {
		logger.Error("openai_response_empty")
		return fmt.Errorf("openai returned no choices")
	}

	content := cleanJSON(extractMessageContent(parsed.Choices[0].Message.Content))
	if err := json.Unmarshal([]byte(content), out); err != nil {
		logger.Error("openai_response_parse_failed", slog.String("error", err.Error()))
		return fmt.Errorf("failed to parse model JSON: %w", err)
	}

	logger.Info("openai_request_completed", slog.Duration("duration", time.Since(startedAt)))
	return nil
}

func extractMessageContent(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if t, _ := m["type"].(string); t == "text" {
				if txt, _ := m["text"].(string); txt != "" {
					parts = append(parts, txt)
				}
			}
		}
		return strings.Join(parts, "\n")
	default:
		return ""
	}
}

func normalizeImageDataURL(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "data:image") {
		return s
	}
	return "data:image/png;base64," + s
}

func cleanJSON(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
