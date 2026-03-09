# SnapRecall Desktop (Electron + React)

## What this MVP does
- Global shortcut triggers quick screen capture.
- Capture can also come from clipboard paste or file upload.
- Sends image/OCR text to backend `/v1/captures`.
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

Default values:
- `VITE_BACKEND_URL=http://localhost:8080`
- `CAPTURE_SHORTCUT=CommandOrControl+Shift+S`

## 3) Run dev mode
```bash
cd desktop
set -a; source .env; set +a
npm run dev
```

## Notes
- Screen capture uses Electron `desktopCapturer` and may require OS screen recording permission.
- Current capture is full-screen primary display; region crop can be added as the next step.
