package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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

func (c *OpenAIClient) AnalyzeCapture(ctx context.Context, ocrText, tagHint string) (CaptureAnalysis, error) {
	var out CaptureAnalysis

	system := `You extract high-value facts from OCR text.
Return JSON only with keys: summary, tag, fields.
- summary: one concise sentence.
- tag: one of exam, flight, event, other.
- fields: array of {type, value, confidence}.
- confidence is float 0..1.
- Prioritize date, time, location, ticket_number, booking_reference, flight_number.`

	user := fmt.Sprintf("tag_hint: %s\nocr_text:\n%s", tagHint, ocrText)
	if err := c.chatJSON(ctx, system, user, &out); err != nil {
		return CaptureAnalysis{}, err
	}

	if out.Summary == "" {
		out.Summary = "Captured important information."
	}
	if out.Tag == "" {
		out.Tag = "other"
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
	}

	views := make([]captureView, 0, len(captures))
	for _, c := range captures {
		views = append(views, captureView{
			ID:         c.ID,
			CapturedAt: c.CapturedAt,
			Summary:    c.Summary,
			Tag:        c.Tag,
			Fields:     c.Fields,
		})
	}

	ctxJSON, _ := json.Marshal(views)

	system := `You answer factual recall questions only from provided capture data.
Return JSON only with keys: answer, source_capture_id, confidence.
Rules:
- If information cannot be verified, answer "I cannot verify this from your saved captures.", leave source_capture_id empty, and confidence <= 0.35.
- Include concrete facts only if they exist in fields/summary.
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

func (c *OpenAIClient) chatJSON(ctx context.Context, system, user string, out any) error {
	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
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
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return err
	}

	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("openai chat completion failed with status %d", resp.StatusCode)
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return err
	}

	if len(parsed.Choices) == 0 {
		return fmt.Errorf("openai returned no choices")
	}

	content := cleanJSON(parsed.Choices[0].Message.Content)
	if err := json.Unmarshal([]byte(content), out); err != nil {
		return fmt.Errorf("failed to parse model JSON: %w", err)
	}

	return nil
}

func cleanJSON(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
