# SnapRecall - One-Page Engineering Spec (MVP)

## 1) Goal
Capture important on-screen information in seconds, extract key facts with AI, and answer factual recall questions via Telegram with source-backed responses.

## 2) Recommended Direction
- Product name: **SnapRecall**
- Backend: **Golang** REST API (simple single service)
- Frontend (desktop capture app): **Electron + React**
- Why this frontend: fastest reliable path for global shortcuts, tray/sticky button behavior, and screenshot capture APIs.

## 3) MVP Scope
In scope:
- Global shortcut or sticky tray button triggers region screenshot.
- OCR + AI extraction pipeline returns summary + structured fields.
- Telegram bot sends capture summaries.
- Telegram Q&A answers from saved facts with source timestamp.

Out of scope:
- Team sharing
- Multi-device sync complexity
- Advanced agent workflows

## 4) User Flow
1. User hits shortcut or clicks sticky button.
2. Desktop app captures selected region and sends OCR text (and later image) to backend.
3. Backend extracts summary + fields + confidence.
4. Backend stores record and pushes summary to Telegram chat.
5. User asks Telegram: "What time is my exam and where?"
6. Backend answers using stored structured facts first; falls back to OCR context; always cites source.

## 5) API Contract (MVP)
### POST `/v1/captures`
Request:
```json
{
  "user_id": "u_123",
  "ocr_text": "Exam: CS2040 on 12 Apr 2026 09:00 at LT19",
  "tag_hint": "exam",
  "source_app": "chrome",
  "source_title": "NUS exam schedule",
  "chat_id": "123456789"
}
```
Response:
```json
{
  "capture_id": "cap_...",
  "summary": "CS2040 exam on 12 Apr 2026 at 09:00 in LT19.",
  "tag": "exam",
  "fields": [
    {"type": "date", "value": "2026-04-12", "confidence": 0.96},
    {"type": "time", "value": "09:00", "confidence": 0.94},
    {"type": "location", "value": "LT19", "confidence": 0.92}
  ],
  "captured_at": "2026-03-09T10:00:00Z"
}
```

### POST `/v1/query`
Request:
```json
{
  "user_id": "u_123",
  "question": "What time is my exam and where?"
}
```
Response:
```json
{
  "answer": "Your CS2040 exam is at 09:00 in LT19 (from capture on 2026-03-09 18:00 SGT).",
  "source_capture_id": "cap_...",
  "confidence": 0.91
}
```

### GET `/healthz`
Response:
```json
{"ok": true}
```

## 6) Telegram Commands (MVP)
- `/latest` -> show latest saved capture summary.
- `/ask <question>` -> factual Q&A from saved captures.
- `/search <keyword>` -> return top matching captures.
- `/help` -> show command list.

## 7) JSON Schema (Core Record)
```json
{
  "id": "cap_...",
  "user_id": "u_123",
  "captured_at": "2026-03-09T10:00:00Z",
  "source": {
    "app": "chrome",
    "title": "NUS exam schedule"
  },
  "ocr_text": "raw OCR text",
  "summary": "short summary",
  "tag": "exam",
  "fields": [
    {"type": "date", "value": "2026-04-12", "confidence": 0.96}
  ]
}
```

## 8) Reliability Rules
- Retrieval order: structured fields -> OCR semantic fallback.
- If confidence is low, return "cannot verify" instead of guessing.
- Every answer includes source capture timestamp.

## 9) Security + Secrets
- Keep all credentials in `.env` (see `.env.example`).
- Never log raw API keys or Telegram tokens.
- Redact sensitive fields in logs.

## 10) Success Criteria
- Capture-to-saved success >95%
- P50 processing latency <8s
- Factual answer accuracy >90% on exam/flight/event data classes
