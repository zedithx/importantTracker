# SnapRecall Backend (Go)

Minimal MVP backend for:
- Capture processing (`/v1/captures`)
- Q&A retrieval (`/v1/query`)
- Telegram push notifications
- Telegram event-ID linking (`/v1/integrations/telegram/*`)
- Account auth (`/v1/auth/*`)

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
- `AUTH_JWT_SECRET` (required for login/session token signing)

Supabase DSN format example:
`postgresql://postgres.<project-ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`

## 2) Run
```bash
cd backend
go run ./cmd/server
```

The backend auto-loads `.env` (tries `backend/.env` then `../.env`).

## 3) Telegram link flow
1. Desktop calls `POST /v1/integrations/telegram/start` with auth token.
2. Backend returns `event_id` (example: `EVT-12AB34`).
3. User starts Telegram bot and sends that `event_id` message.
4. Backend polling worker claims link and maps `user_id` -> `chat_id`.
5. Desktop polls `GET /v1/integrations/telegram/status?event_id=...` until status is `linked`.

For logged-in users, Telegram link state can be checked with:
- `GET /v1/integrations/telegram/me` (requires `Authorization: Bearer <token>`)

After linking, Telegram chat supports:
- send plain text question directly
- or send `/ask <question>`

## 4) API quick test
Register user:
```bash
curl -X POST http://localhost:8080/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"you@example.com",
    "password":"supersecret123"
  }'
```

Login user:
```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"you@example.com",
    "password":"supersecret123"
  }'
```

Use the returned token for protected endpoints:
```bash
TOKEN="<paste_auth_token_here>"
```

Create capture:
```bash
curl -X POST http://localhost:8080/v1/captures \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
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
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

Check Telegram link status:
```bash
curl "http://localhost:8080/v1/integrations/telegram/status?event_id=EVT-12AB34" \
  -H "Authorization: Bearer $TOKEN"
```

Ask question:
```bash
curl -X POST http://localhost:8080/v1/query \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "question":"What is my flight booking reference?"
  }'
```

## Notes
- If `POSTGRES_DSN`/`DATABASE_URL` is set, backend auto-runs migrations and persists captures/linking data in Postgres.
- Postgres persistence uses `gorm` for queries and `golang-migrate` for versioned migrations (`backend/internal/store/migrations`).
- Auth uses JWT bearer tokens (`Authorization: Bearer <token>`).
- If no Postgres DSN is set, backend falls back to in-memory store.
- Supports either `ocr_text` or `image_base64`.
- Keep secrets in `.env` only.
