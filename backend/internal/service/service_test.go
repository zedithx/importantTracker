package service

import (
	"context"
	"sync"
	"testing"

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
}

func (n *countingNotifier) SendCaptureSummary(context.Context, string, model.CaptureRecord) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.calls++
	return nil
}

func (n *countingNotifier) Count() int {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.calls
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
