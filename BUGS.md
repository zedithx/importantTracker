# BUGS LOG

Use this file to record each bug in a consistent format.

## Entry Format
- **Date:** YYYY-MM-DD
- **Bug/Error:**
- **Impact:**
- **Reproduction Steps:**
- **Root Cause:**
- **Resolution Method:**
- **Status:** Open | In Progress | Resolved
- **Owner:**
- **Notes:**

---

## Bug 001
- **Date:** 2026-03-09
- **Bug/Error:** `npm run lint` flagged `React` and `App` as unused in `desktop/src/main.jsx`.
- **Impact:** Lint gate failed and blocked finalize checks.
- **Reproduction Steps:** Run `cd desktop && npm run lint`.
- **Root Cause:** ESLint baseline `no-unused-vars` did not count JSX references in the current setup.
- **Resolution Method:** Updated `desktop/src/main.jsx` render call to `React.createElement(...)` so imported symbols are explicitly referenced.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Keep lint setup minimal for now; can migrate to `eslint-plugin-react` later if preferred.

## Bug 002
- **Date:** 2026-03-10
- **Bug/Error:** Telegram event-link polling used a `getUpdates` timeout longer than the HTTP client timeout.
- **Impact:** Telegram link status could fail to update reliably due to periodic timeout errors.
- **Reproduction Steps:** Start backend, trigger Telegram link generation, monitor backend logs during polling.
- **Root Cause:** `getUpdates` timeout was 25s while client/request timeout was 20s.
- **Resolution Method:** Reduced poll call timeout to 10s and watcher context timeout to 20s.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Keep Telegram poll timeout lower than HTTP client timeout.

## Bug 003
- **Date:** 2026-03-10
- **Bug/Error:** Desktop app showed `Failed to fetch` on capture/query requests.
- **Impact:** Core actions (`Capture and Save`, `Ask`) failed from frontend.
- **Reproduction Steps:** Run desktop frontend and trigger capture/query while backend lacks CORS preflight handling or is unreachable.
- **Root Cause:** Backend did not handle CORS `OPTIONS` preflight for browser/Electron renderer requests.
- **Resolution Method:** Added CORS middleware in backend (`Access-Control-Allow-*` headers and `OPTIONS` -> `204`) and improved frontend fetch error message to show backend startup command.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Verified with live preflight test (`OPTIONS /v1/query`) and successful capture/query requests.

## Bug 004
- **Date:** 2026-03-10
- **Bug/Error:** Telegram summary notifications could be sent twice for rapid duplicate captures.
- **Impact:** Users received duplicate summary messages in Telegram for a single intended capture action.
- **Reproduction Steps:** Trigger two near-identical capture requests in quick succession and observe Telegram chat output.
- **Root Cause:** Notification dispatch did not include short-window deduplication for repeated identical capture summaries.
- **Resolution Method:** Added a 15-second in-memory dedupe gate in service layer keyed by `chat_id + tag + summary` and added regression tests for service and message formatting.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Message template also removed `Source` and `Captured` fields as requested.

## Bug 005
- **Date:** 2026-03-10
- **Bug/Error:** Returning users could not reliably see existing Telegram link state after login, making reintegration appear necessary.
- **Impact:** Confusing UX and repeated integration attempts even when account already had a linked chat.
- **Reproduction Steps:** Login with an account that already has `telegram_chat_links` data; desktop still shows integration CTA without checking account-level status.
- **Root Cause:** Frontend only tracked event-based link polling and had no authenticated endpoint to fetch current account linkage status.
- **Resolution Method:** Added backend endpoint `GET /v1/integrations/telegram/me` and frontend auto-check on login/startup; `StartTelegramLink` now returns linked state immediately for already-linked accounts.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Added service tests covering auth, link status, and linked-chat notification routing.

## Bug 006
- **Date:** 2026-03-10
- **Bug/Error:** Desktop app failed to start and lint with syntax/parsing errors caused by unresolved merge conflict markers.
- **Impact:** `App.jsx` and Electron runtime files were not parseable, blocking app startup and frontend lint checks.
- **Reproduction Steps:** Run `cd desktop && npm run lint` or start the desktop app with unresolved conflict markers in source files.
- **Root Cause:** Merge conflict sections (`<<<<<<<`, `=======`, `>>>>>>>`) were committed in `src/App.jsx`, `electron/main.cjs`, and `electron/preload.cjs`.
- **Resolution Method:** Replaced conflict-marked files with clean, syntactically valid implementations, then validated with `npm run lint`, `npm run build`, and `node -c` checks for Electron files.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Also cleaned `desktop/README.md` conflict artifacts to prevent future confusion.

## Bug 007
- **Date:** 2026-03-10
- **Bug/Error:** `npm run lint` failed after the UI rewrite with `imageDataURL` unused and a missing `captureAndSave` hook dependency warning.
- **Impact:** Frontend quality gate was blocked; release confidence dropped because shortcut listener could capture stale callback logic.
- **Reproduction Steps:** Run `cd desktop && npm run lint` after applying the redesigned `App.jsx`.
- **Root Cause:** Capture preview state was set but never rendered, and the Electron shortcut `useEffect` referenced `captureAndSave` without listing it in dependencies.
- **Resolution Method:** Rendered live capture preview in the capture details panel, moved `captureAndSave` to a stable `useCallback` position, and updated effect deps to include `captureAndSave`.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Verified by running `npm run lint` and `npm run build` successfully.

## Bug 008
- **Date:** 2026-03-10
- **Bug/Error:** Telegram polling logs `telegram getUpdates failed with status 409` when more than one backend instance runs with the same bot token.
- **Impact:** Telegram link/check updates can fail on one instance; noisy logs and unreliable bot behavior in multi-instance local runs.
- **Reproduction Steps:** Start one backend instance, then start another backend instance using the same `.env` `TELEGRAM_BOT_TOKEN`.
- **Root Cause:** Telegram `getUpdates` long-poll API allows only one active consumer per bot token.
- **Resolution Method:** Run a single polling backend per bot token (or move to webhook mode for scaled deployment).
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Observed during local smoke test on a second API port while another backend process was already active.
