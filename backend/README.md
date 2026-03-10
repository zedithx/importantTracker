# SnapRecall Backend (Go)

Minimal MVP backend for:
- Capture processing (`/v1/captures`)
- Q&A retrieval (`/v1/query`)
- Telegram push notifications
- Telegram event-ID linking (`/v1/integrations/telegram/*`)

## 1) Setup
```bash
cp .env.example .env
```

Fill in:
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_API_BASE_URL` (optional, defaults to Telegram official API)
- `TELEGRAM_DEFAULT_CHAT_ID` (optional fallback)
- `POSTGRES_DSN` or `DATABASE_URL` (required for persistent storage)

Supabase DSN format example:
`postgresql://postgres.<project-ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`

## 2) Run
```bash
cd backend
go run ./cmd/server
```

The backend auto-loads `.env` (tries `backend/.env` then `../.env`).

## 3) Telegram link flow
1. Desktop calls `POST /v1/integrations/telegram/start` with `user_id`.
2. Backend returns `event_id` (example: `EVT-12AB34`).
3. User starts Telegram bot and sends that `event_id` message.
4. Backend polling worker claims link and maps `user_id` -> `chat_id`.
5. Desktop polls `GET /v1/integrations/telegram/status?event_id=...` until status is `linked`.

After linking, Telegram chat supports:
- send plain text question directly
- or send `/ask <question>`

## 4) API quick test
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

Start Telegram link:
```bash
curl -X POST http://localhost:8080/v1/integrations/telegram/start \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"u_1"}'
```

Check Telegram link status:
```bash
curl "http://localhost:8080/v1/integrations/telegram/status?event_id=EVT-12AB34"
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
- If `POSTGRES_DSN`/`DATABASE_URL` is set, backend auto-runs migrations and persists captures/linking data in Postgres.
- If no Postgres DSN is set, backend falls back to in-memory store.
- Supports either `ocr_text` or `image_base64`.
- Keep secrets in `.env` only.
