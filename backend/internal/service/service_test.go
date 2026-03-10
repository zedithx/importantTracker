package service

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"importanttracker/backend/internal/ai"
	"importanttracker/backend/internal/model"
	"importanttracker/backend/internal/store"
)

type stubAnalyzer struct {
	analysis ai.CaptureAnalysis
}

func (s stubAnalyzer) AnalyzeCapture(context.Context, string, string, string) (ai.CaptureAnalysis, error) {
	return s.analysis, nil
}

func (s stubAnalyzer) AnswerQuestion(context.Context, string, []model.CaptureRecord) (model.QueryAnswer, error) {
	return model.QueryAnswer{}, nil
}

type countingNotifier struct {
	mu    sync.Mutex
	calls int
	chats []string
}

func (n *countingNotifier) SendCaptureSummary(_ context.Context, chatID string, _ model.CaptureRecord) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.calls++
	n.chats = append(n.chats, chatID)
	return nil
}

func (n *countingNotifier) Count() int {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.calls
}

func (n *countingNotifier) LastChatID() string {
	n.mu.Lock()
	defer n.mu.Unlock()

	if len(n.chats) == 0 {
		return ""
	}
	return n.chats[len(n.chats)-1]
}

func TestProcessCapture_DedupesRapidTelegramNotification(t *testing.T) {
	svc := New(
		stubAnalyzer{
			analysis: ai.CaptureAnalysis{
				Summary: "Exam is at 9:00 AM in LT1.",
				Tag:     "event",
				Fields:  []model.Field{{Type: "time", Value: "9:00 AM", Confidence: 0.9}},
				OCRText: "Exam Tuesday 9:00 AM LT1",
			},
		},
		store.NewMemoryStore(),
		&countingNotifier{},
		"12345678",
	)

	in := model.CaptureInput{
		UserID:  "u_test",
		OCRText: "Exam Tuesday 9:00 AM LT1",
	}

	notifier := svc.notifier.(*countingNotifier)

	_, warning, err := svc.ProcessCapture(context.Background(), in)
	if err != nil {
		t.Fatalf("first ProcessCapture returned error: %v", err)
	}
	if warning != "" {
		t.Fatalf("first ProcessCapture returned warning: %s", warning)
	}

	_, warning, err = svc.ProcessCapture(context.Background(), in)
	if err != nil {
		t.Fatalf("second ProcessCapture returned error: %v", err)
	}
	if warning != "" {
		t.Fatalf("second ProcessCapture returned warning: %s", warning)
	}

	if got := notifier.Count(); got != 1 {
		t.Fatalf("expected exactly one Telegram notification, got %d", got)
	}

	if got := len(svc.store.ListCaptures("u_test", 10)); got != 2 {
		t.Fatalf("expected both captures to be saved, got %d", got)
	}
}

func TestDeleteCapture_RemovesOwnedRecord(t *testing.T) {
	mem := store.NewMemoryStore()
	svc := New(
		stubAnalyzer{
			analysis: ai.CaptureAnalysis{
				Summary: "Exam at 9:00 AM",
				Tag:     "exam",
				Fields:  []model.Field{{Type: "time", Value: "9:00 AM", Confidence: 0.9}},
				OCRText: "Exam at 9:00 AM",
			},
		},
		mem,
		&countingNotifier{},
		"",
	)

	first, _, err := svc.ProcessCapture(context.Background(), model.CaptureInput{
		UserID:  "u_delete",
		OCRText: "Exam at 9:00 AM",
	})
	if err != nil {
		t.Fatalf("first ProcessCapture returned error: %v", err)
	}

	second, _, err := svc.ProcessCapture(context.Background(), model.CaptureInput{
		UserID:  "u_delete",
		OCRText: "Exam at 10:00 AM",
	})
	if err != nil {
		t.Fatalf("second ProcessCapture returned error: %v", err)
	}

	deleted, err := svc.DeleteCapture("u_delete", first.ID)
	if err != nil {
		t.Fatalf("DeleteCapture returned error: %v", err)
	}
	if !deleted {
		t.Fatalf("expected capture to be deleted")
	}

	records, err := svc.ListRecentCaptures("u_delete", 10)
	if err != nil {
		t.Fatalf("ListRecentCaptures returned error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected one capture after delete, got %d", len(records))
	}
	if records[0].ID != second.ID {
		t.Fatalf("expected remaining capture %q, got %q", second.ID, records[0].ID)
	}

	deleted, err = svc.DeleteCapture("another_user", second.ID)
	if err != nil {
		t.Fatalf("DeleteCapture for non-owner returned error: %v", err)
	}
	if deleted {
		t.Fatalf("expected non-owner delete to fail")
	}
}

func TestRegisterAuthenticateAndLoadUserProfile(t *testing.T) {
	svc := New(
		stubAnalyzer{},
		store.NewMemoryStore(),
		&countingNotifier{},
		"",
	)

	user, err := svc.RegisterUser(context.Background(), model.AuthRegisterInput{
		Email:    "User@Example.com",
		Password: "supersecret123",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	if user.UserID == "" {
		t.Fatalf("expected user id to be set")
	}
	if user.Email != "user@example.com" {
		t.Fatalf("expected normalized email user@example.com, got %q", user.Email)
	}

	_, err = svc.RegisterUser(context.Background(), model.AuthRegisterInput{
		Email:    "user@example.com",
		Password: "anothersecret123",
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "already registered") {
		t.Fatalf("expected duplicate email error, got %v", err)
	}

	authUser, err := svc.AuthenticateUser(context.Background(), model.AuthLoginInput{
		Email:    "USER@example.com",
		Password: "supersecret123",
	})
	if err != nil {
		t.Fatalf("AuthenticateUser returned error: %v", err)
	}
	if authUser.UserID != user.UserID {
		t.Fatalf("expected same user id, got %q vs %q", authUser.UserID, user.UserID)
	}

	_, err = svc.AuthenticateUser(context.Background(), model.AuthLoginInput{
		Email:    "user@example.com",
		Password: "wrong-password",
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "invalid email or password") {
		t.Fatalf("expected invalid credentials error, got %v", err)
	}

	profile, err := svc.GetUserProfile(context.Background(), user.UserID)
	if err != nil {
		t.Fatalf("GetUserProfile returned error: %v", err)
	}
	if profile.Email != user.Email {
		t.Fatalf("expected profile email %q, got %q", user.Email, profile.Email)
	}
}

func TestTelegramLinkAndCaptureUseLinkedChat(t *testing.T) {
	mem := store.NewMemoryStore()
	notifier := &countingNotifier{}
	svc := New(
		stubAnalyzer{
			analysis: ai.CaptureAnalysis{
				Summary: "Flight SQ123 departs at 08:00.",
				Tag:     "flight",
				Fields:  []model.Field{{Type: "time", Value: "08:00", Confidence: 0.9}},
				OCRText: "Flight SQ123 08:00",
			},
		},
		mem,
		notifier,
		"",
	)

	userID := "usr_linked"
	link, err := svc.StartTelegramLink(userID)
	if err != nil {
		t.Fatalf("StartTelegramLink returned error: %v", err)
	}
	if link.Status != "pending" || link.EventID == "" {
		t.Fatalf("expected pending link with event id, got %+v", link)
	}

	claimed, ok := svc.TryCompleteTelegramLink(link.EventID, "chat_123")
	if !ok {
		t.Fatalf("expected TryCompleteTelegramLink to succeed")
	}
	if claimed.Status != "linked" {
		t.Fatalf("expected linked status, got %q", claimed.Status)
	}

	status, err := svc.GetTelegramIntegrationStatus(userID)
	if err != nil {
		t.Fatalf("GetTelegramIntegrationStatus returned error: %v", err)
	}
	if status.Status != "linked" || status.ChatID != "chat_123" {
		t.Fatalf("unexpected status %+v", status)
	}

	again, err := svc.StartTelegramLink(userID)
	if err != nil {
		t.Fatalf("StartTelegramLink second call returned error: %v", err)
	}
	if again.Status != "linked" || again.ChatID != "chat_123" {
		t.Fatalf("expected existing linked status, got %+v", again)
	}

	_, warning, err := svc.ProcessCapture(context.Background(), model.CaptureInput{
		UserID:  userID,
		OCRText: "Flight SQ123 08:00",
	})
	if err != nil {
		t.Fatalf("ProcessCapture returned error: %v", err)
	}
	if warning != "" {
		t.Fatalf("expected no warning, got %q", warning)
	}

	if notifier.Count() != 1 {
		t.Fatalf("expected 1 Telegram notification, got %d", notifier.Count())
	}
	if notifier.LastChatID() != "chat_123" {
		t.Fatalf("expected notification to linked chat_123, got %q", notifier.LastChatID())
	}

	linkedAt := claimed.LinkedAt
	if linkedAt == nil || linkedAt.IsZero() || linkedAt.After(time.Now().UTC().Add(2*time.Second)) {
		t.Fatalf("expected reasonable linked_at timestamp, got %v", linkedAt)
	}
}

func TestGetTelegramLinkStatus_AppliesOwnershipAndExpiry(t *testing.T) {
	mem := store.NewMemoryStore()
	svc := New(
		stubAnalyzer{},
		mem,
		&countingNotifier{},
		"",
	)

	expiredLink := model.TelegramLinkStatus{
		EventID:   "EVT-ABC123",
		UserID:    "usr_owner",
		Status:    "pending",
		CreatedAt: time.Now().UTC().Add(-11 * time.Minute),
	}
	if err := mem.CreateTelegramLink(expiredLink); err != nil {
		t.Fatalf("CreateTelegramLink returned error: %v", err)
	}

	status, err := svc.GetTelegramLinkStatus("usr_owner", expiredLink.EventID)
	if err != nil {
		t.Fatalf("GetTelegramLinkStatus returned error: %v", err)
	}
	if status.Status != "expired" {
		t.Fatalf("expected expired status, got %q", status.Status)
	}

	if _, ok := svc.TryCompleteTelegramLink(expiredLink.EventID, "chat_456"); ok {
		t.Fatalf("expected TryCompleteTelegramLink to fail for expired event")
	}

	_, err = svc.GetTelegramLinkStatus("usr_other", expiredLink.EventID)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "not found") {
		t.Fatalf("expected not found for non-owner, got %v", err)
	}
}
