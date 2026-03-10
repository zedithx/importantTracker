package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"importanttracker/backend/internal/ai"
	"importanttracker/backend/internal/model"
)

var telegramEventPattern = regexp.MustCompile(`EVT-[A-Z0-9]{6}`)

type Analyzer interface {
	AnalyzeCapture(ctx context.Context, ocrText, imageBase64, tagHint string) (ai.CaptureAnalysis, error)
	AnswerQuestion(ctx context.Context, question string, captures []model.CaptureRecord) (model.QueryAnswer, error)
}

type CaptureStore interface {
	SaveCapture(record model.CaptureRecord) error
	ListCaptures(userID string, limit int) []model.CaptureRecord
	GetCapture(id string) (model.CaptureRecord, bool)
	CreateTelegramLink(link model.TelegramLinkStatus) error
	GetTelegramLink(eventID string) (model.TelegramLinkStatus, bool)
	ClaimTelegramLink(eventID, chatID string, linkedAt time.Time) (model.TelegramLinkStatus, bool)
	GetTelegramChatIDByUser(userID string) (string, bool)
	GetUserIDByTelegramChatID(chatID string) (string, bool)
}

type TelegramNotifier interface {
	SendCaptureSummary(ctx context.Context, chatID string, record model.CaptureRecord) error
}

type Service struct {
	analyzer      Analyzer
	store         CaptureStore
	notifier      TelegramNotifier
	defaultChatID string
	notifyMu      sync.Mutex
	notifySeen    map[string]time.Time
}

func New(analyzer Analyzer, store CaptureStore, notifier TelegramNotifier, defaultChatID string) *Service {
	return &Service{
		analyzer:      analyzer,
		store:         store,
		notifier:      notifier,
		defaultChatID: defaultChatID,
		notifySeen:    make(map[string]time.Time),
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

	if err := s.store.SaveCapture(record); err != nil {
		return model.CaptureRecord{}, "", fmt.Errorf("save capture: %w", err)
	}

	chatID := strings.TrimSpace(in.ChatID)
	if chatID == "" {
		if linkedChat, ok := s.store.GetTelegramChatIDByUser(in.UserID); ok {
			chatID = linkedChat
		}
	}
	if chatID == "" {
		chatID = s.defaultChatID
	}

	warning := ""
	if s.shouldSendCaptureNotification(chatID, record) {
		if err := s.notifier.SendCaptureSummary(ctx, chatID, record); err != nil {
			warning = "capture was saved but Telegram notification failed"
		}
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

func (s *Service) StartTelegramLink(userID string) (model.TelegramLinkStatus, error) {
	if strings.TrimSpace(userID) == "" {
		return model.TelegramLinkStatus{}, fmt.Errorf("user_id is required")
	}

	for attempt := 0; attempt < 5; attempt++ {
		eventID := generateTelegramEventID()
		link := model.TelegramLinkStatus{
			EventID:   eventID,
			UserID:    strings.TrimSpace(userID),
			Status:    "pending",
			CreatedAt: time.Now().UTC(),
		}

		if err := s.store.CreateTelegramLink(link); err == nil {
			return link, nil
		}
	}

	return model.TelegramLinkStatus{}, fmt.Errorf("failed to create telegram link event")
}

func (s *Service) GetTelegramLinkStatus(eventID string) (model.TelegramLinkStatus, error) {
	normalized := normalizeTelegramEventID(eventID)
	if normalized == "" {
		return model.TelegramLinkStatus{}, fmt.Errorf("event_id is required")
	}

	link, ok := s.store.GetTelegramLink(normalized)
	if !ok {
		return model.TelegramLinkStatus{}, fmt.Errorf("event_id not found")
	}
	return link, nil
}

func (s *Service) TryCompleteTelegramLink(text, chatID string) (model.TelegramLinkStatus, bool) {
	eventID := extractTelegramEventID(text)
	if eventID == "" || strings.TrimSpace(chatID) == "" {
		return model.TelegramLinkStatus{}, false
	}

	link, ok := s.store.ClaimTelegramLink(eventID, strings.TrimSpace(chatID), time.Now().UTC())
	if !ok {
		return model.TelegramLinkStatus{}, false
	}

	return link, true
}

func (s *Service) HandleTelegramQuestion(ctx context.Context, chatID, text string) (string, bool) {
	chatID = strings.TrimSpace(chatID)
	text = strings.TrimSpace(text)
	if chatID == "" || text == "" {
		return "", false
	}

	if text == "/start" {
		return "Send your question directly after linking, or use /ask <question>.", true
	}

	question := text
	if strings.HasPrefix(strings.ToLower(text), "/ask") {
		question = strings.TrimSpace(text[len("/ask"):])
		if question == "" {
			return "Usage: /ask <your question>", true
		}
	} else if strings.HasPrefix(text, "/") {
		return "Unknown command. Use /ask <question> or send your question directly.", true
	}

	userID, linked := s.store.GetUserIDByTelegramChatID(chatID)
	if !linked {
		return "This chat is not linked yet. In desktop app, click Integrate with Telegram and send the generated event ID here.", true
	}

	answer, err := s.AnswerQuestion(ctx, model.QueryInput{
		UserID:   userID,
		Question: question,
	})
	if err != nil {
		return "I could not answer right now. Please try again.", true
	}

	return answer.Answer, true
}

func extractTelegramEventID(text string) string {
	upper := strings.ToUpper(strings.TrimSpace(text))
	if upper == "" {
		return ""
	}

	match := telegramEventPattern.FindString(upper)
	if match == "" {
		return ""
	}

	return match
}

func normalizeTelegramEventID(raw string) string {
	return extractTelegramEventID(raw)
}

func generateCaptureID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("cap_%d", time.Now().UnixNano())
	}
	return "cap_" + hex.EncodeToString(buf)
}

func generateTelegramEventID() string {
	buf := make([]byte, 3)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("EVT-%06d", time.Now().UnixNano()%1000000)
	}
	return "EVT-" + strings.ToUpper(hex.EncodeToString(buf))
}

func (s *Service) shouldSendCaptureNotification(chatID string, record model.CaptureRecord) bool {
	if strings.TrimSpace(chatID) == "" {
		return false
	}

	key := strings.ToLower(strings.TrimSpace(chatID)) + "|" + strings.ToLower(strings.TrimSpace(record.Tag)) + "|" + strings.TrimSpace(record.Summary)
	now := time.Now().UTC()

	s.notifyMu.Lock()
	defer s.notifyMu.Unlock()

	// Keep memory bounded by dropping stale entries.
	for k, t := range s.notifySeen {
		if now.Sub(t) > 2*time.Minute {
			delete(s.notifySeen, k)
		}
	}

	if last, ok := s.notifySeen[key]; ok && now.Sub(last) <= 15*time.Second {
		return false
	}

	s.notifySeen[key] = now
	return true
}
