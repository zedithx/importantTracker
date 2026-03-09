package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"importanttracker/backend/internal/ai"
	"importanttracker/backend/internal/model"
)

type Analyzer interface {
	AnalyzeCapture(ctx context.Context, ocrText, imageBase64, tagHint string) (ai.CaptureAnalysis, error)
	AnswerQuestion(ctx context.Context, question string, captures []model.CaptureRecord) (model.QueryAnswer, error)
}

type CaptureStore interface {
	SaveCapture(record model.CaptureRecord)
	ListCaptures(userID string, limit int) []model.CaptureRecord
	GetCapture(id string) (model.CaptureRecord, bool)
}

type TelegramNotifier interface {
	SendCaptureSummary(ctx context.Context, chatID string, record model.CaptureRecord) error
}

type Service struct {
	analyzer      Analyzer
	store         CaptureStore
	notifier      TelegramNotifier
	defaultChatID string
}

func New(analyzer Analyzer, store CaptureStore, notifier TelegramNotifier, defaultChatID string) *Service {
	return &Service{
		analyzer:      analyzer,
		store:         store,
		notifier:      notifier,
		defaultChatID: defaultChatID,
	}
}

func (s *Service) ProcessCapture(ctx context.Context, in model.CaptureInput) (model.CaptureRecord, string, error) {
	if strings.TrimSpace(in.UserID) == "" {
		return model.CaptureRecord{}, "", fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(in.OCRText) == "" && strings.TrimSpace(in.ImageBase64) == "" {
		return model.CaptureRecord{}, "", fmt.Errorf("ocr_text or image_base64 is required")
	}

	analysis, err := s.analyzer.AnalyzeCapture(ctx, in.OCRText, in.ImageBase64, in.TagHint)
	if err != nil {
		return model.CaptureRecord{}, "", err
	}

	ocrText := in.OCRText
	if strings.TrimSpace(ocrText) == "" {
		ocrText = analysis.OCRText
	}

	record := model.CaptureRecord{
		ID:         generateCaptureID(),
		UserID:     in.UserID,
		CapturedAt: time.Now().UTC(),
		Source: model.SourceMeta{
			App:   in.SourceApp,
			Title: in.SourceTitle,
		},
		OCRText: ocrText,
		Summary: analysis.Summary,
		Tag:     analysis.Tag,
		Fields:  analysis.Fields,
	}

	s.store.SaveCapture(record)

	chatID := in.ChatID
	if chatID == "" {
		chatID = s.defaultChatID
	}

	warning := ""
	if err := s.notifier.SendCaptureSummary(ctx, chatID, record); err != nil {
		warning = "capture was saved but Telegram notification failed"
	}

	return record, warning, nil
}

func (s *Service) AnswerQuestion(ctx context.Context, in model.QueryInput) (model.QueryAnswer, error) {
	if strings.TrimSpace(in.UserID) == "" {
		return model.QueryAnswer{}, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(in.Question) == "" {
		return model.QueryAnswer{}, fmt.Errorf("question is required")
	}

	records := s.store.ListCaptures(in.UserID, 30)
	if len(records) == 0 {
		return model.QueryAnswer{
			Answer:     "I cannot verify this from your saved captures.",
			Confidence: 0.1,
		}, nil
	}

	answer, err := s.analyzer.AnswerQuestion(ctx, in.Question, records)
	if err != nil {
		fallback := records[0]
		return model.QueryAnswer{
			Answer:          fmt.Sprintf("I cannot fully verify. Latest relevant capture says: %s (from %s)", fallback.Summary, fallback.CapturedAt.Format(time.RFC3339)),
			SourceCaptureID: fallback.ID,
			Confidence:      0.3,
		}, nil
	}

	if answer.SourceCaptureID != "" {
		if source, ok := s.store.GetCapture(answer.SourceCaptureID); ok {
			answer.Answer = fmt.Sprintf("%s (from capture on %s)", answer.Answer, source.CapturedAt.Format("2006-01-02 15:04 MST"))
		}
	}

	return answer, nil
}

func generateCaptureID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("cap_%d", time.Now().UnixNano())
	}
	return "cap_" + hex.EncodeToString(buf)
}
