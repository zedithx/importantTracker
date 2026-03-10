package telegram

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"importanttracker/backend/internal/model"
)

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestSendCaptureSummary_MessageFormat(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		record  model.CaptureRecord
		wantMsg string
	}{
		{
			name: "event tag",
			record: model.CaptureRecord{
				Tag:     "event",
				Summary: "Exam is at 9:00 AM, LT1.",
			},
			wantMsg: "Added to [event] Tag\nExam is at 9:00 AM, LT1.",
		},
		{
			name: "non-event tag",
			record: model.CaptureRecord{
				Tag:     "flight",
				Summary: "Flight SQ321, gate B4.",
			},
			wantMsg: "Saved [flight]\nFlight SQ321, gate B4.",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var gotMsg string
			client := NewClient("token", "https://api.telegram.test", 2*time.Second)
			client.http = &http.Client{
				Timeout: 2 * time.Second,
				Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
					if r.Method != http.MethodPost {
						t.Fatalf("unexpected method: %s", r.Method)
					}
					if !strings.HasSuffix(r.URL.Path, "/bottoken/sendMessage") {
						t.Fatalf("unexpected path: %s", r.URL.Path)
					}

					var payload struct {
						Text string `json:"text"`
					}
					if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
						t.Fatalf("decode request body: %v", err)
					}
					gotMsg = payload.Text

					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`{"ok":true}`)),
						Header:     make(http.Header),
					}, nil
				}),
			}
			if err := client.SendCaptureSummary(context.Background(), "12345", tc.record); err != nil {
				t.Fatalf("SendCaptureSummary returned error: %v", err)
			}

			if gotMsg != tc.wantMsg {
				t.Fatalf("unexpected message:\nwant: %q\ngot:  %q", tc.wantMsg, gotMsg)
			}
			if strings.Contains(gotMsg, "Source:") || strings.Contains(gotMsg, "Captured:") {
				t.Fatalf("message still contains removed fields: %q", gotMsg)
			}
		})
	}
}
