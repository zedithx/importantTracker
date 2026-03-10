# SnapRecall

Capture important screen information quickly and recall it later via Telegram.

## What is included
- One-page engineering spec: `docs/engineering-spec.md`
- `.env` placeholders: `.env.example`
- Go backend starter: `backend/`
- Electron + React desktop starter: `desktop/`

## Suggested frontend (desktop app)
Recommended: **Electron + React**
- Reliable global shortcuts
- Reliable region screenshot capture
- Easy tray/sticky button UX
- Fastest MVP path

## Quick run
1. Start backend:
```bash
cp .env.example .env
cd backend
go run ./cmd/server
```
2. Start desktop app:
```bash
cd desktop
npm install
npm run dev
```
