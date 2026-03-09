# SnapRecall Backend (Go)

Minimal MVP backend for:
- Capture processing (`/v1/captures`)
- Q&A retrieval (`/v1/query`)
- Telegram push notifications

## 1) Setup
```bash
cp .env.example .env
```

Fill in:
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHAT_ID` (optional but recommended)

## 2) Run
```bash
cd backend
set -a; source ../.env; set +a
go run ./cmd/server
```

## 3) API quick test
Create capture:
```bash
curl -X POST http://localhost:8080/v1/captures \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id":"u_1",
    "ocr_text":"Flight SQ321 on 2026-04-12 23:40, booking ref AB12CD",
    "tag_hint":"flight",
    "source_app":"mail",
    "source_title":"Flight booking"
  }'
```

Create capture from screenshot payload:
```bash
curl -X POST http://localhost:8080/v1/captures \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id":"u_1",
    "image_base64":"<base64_without_data_url_prefix>",
    "tag_hint":"exam",
    "source_app":"desktop",
    "source_title":"Quick Capture"
  }'
```

Ask question:
```bash
curl -X POST http://localhost:8080/v1/query \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id":"u_1",
    "question":"What is my flight booking reference?"
  }'
```

## Notes
- Store is in-memory for MVP.
- Supports either `ocr_text` or `image_base64`.
- Keep secrets in `.env` only.
