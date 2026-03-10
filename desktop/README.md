# SnapRecall Desktop (Electron + React)

## What this MVP does
- Uses backend `http://localhost:8080` by default.
- Global shortcut triggers quick capture and save.
- Telegram integration uses one button that generates an event ID.
- User starts the Telegram bot, sends the event ID, and the app auto-detects link status.
- Supports Q&A through backend `/v1/query`.

## 1) Install
```bash
cd desktop
npm install
```

## 2) Configure env
```bash
cp .env.example .env
```

Default value:
- `CAPTURE_SHORTCUT=CommandOrControl+Shift+S`

You can still override shortcut at runtime in the app; UI-saved value takes precedence after first save.

## 3) Run dev mode
```bash
cd desktop
npm run dev
```

## Notes
- Screen capture uses Electron `desktopCapturer` and may require OS screen recording permission.
- Current capture is full-screen primary display; region crop can be added as the next step.
