# SnapRecall

Capture important screen information quickly and recall it later via Telegram.

## What is included
- One-page engineering spec: `docs/engineering-spec.md`
- `.env` placeholders: `.env.example`
- Go backend starter: `backend/`

## Suggested frontend (desktop app)
Recommended: **Electron + React**
- Reliable global shortcuts
- Reliable region screenshot capture
- Easy tray/sticky button UX
- Fastest MVP path

Desktop app responsibility:
- Trigger capture from shortcut/button
- Run OCR locally (or send image to backend OCR later)
- Call backend `/v1/captures`
- Optional local capture history view
