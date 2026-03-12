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

## Bug 009
- **Date:** 2026-03-11
- **Bug/Error:** Auth email lookup (`GetUserByEmail`) frequently crossed GORM slow-query threshold (~200ms) against remote Postgres.
- **Impact:** Login/register flows produced noisy slow-SQL warnings and elevated latency on simple indexed lookups.
- **Reproduction Steps:** Trigger auth flow against remote Postgres and observe backend logs showing `SLOW SQL >= 200ms` for `SELECT * FROM "users" WHERE email = ? LIMIT 1`.
- **Root Cause:** Store used default pgx extended protocol, which adds extra network round-trips on high-latency links; logger threshold/no-parameter settings amplified noise and exposed raw query values.
- **Resolution Method:** Switched GORM Postgres driver to `PreferSimpleProtocol: true`, set parameterized query logging, and raised slow-query threshold to 300ms in store logger config.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** `users.email` already had a unique index; this was not an index-missing issue.

## Bug 010
- **Date:** 2026-03-11
- **Bug/Error:** `Delete selected` in desktop captures could report success without removing the item from the visible list, and there was no multi-select delete flow.
- **Impact:** Users could not reliably confirm deletion in the UI and had to delete captures one-by-one.
- **Reproduction Steps:** Open desktop captures list, click `Delete selected`, observe list item still shown; no `select all` or per-row batch delete controls.
- **Root Cause:** Delete flow depended on a refresh path and did not guarantee immediate local state removal. UI only tracked single focused capture, not explicit multi-selection.
- **Resolution Method:** Added local post-delete state pruning for `recentCaptures`, added per-row checkboxes, `Select all` (filtered view), and batch delete over existing delete endpoint with partial-failure handling.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Batch delete currently sends sequential delete requests to `/v1/captures/:id`.

## Bug 011
- **Date:** 2026-03-11
- **Bug/Error:** `Disconnect Telegram` button in Settings only showed a placeholder status message instead of running a disconnect action.
- **Impact:** Users could not unlink Telegram from their account, so mobile notifications and chat linkage could not be revoked from the UI.
- **Reproduction Steps:** Open desktop app Settings -> Telegram Integration -> click `Disconnect Telegram` while connected.
- **Root Cause:** Frontend button callback was hardcoded to `setStatus('Disconnect Telegram is not available yet.')`, so no API call was made.
- **Resolution Method:** Wired the button to call `POST /v1/integrations/telegram/disconnect`, added disconnect loading/status handling in the desktop app, and added a service regression test that verifies unlink and relink flow.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Disconnect removes user chat linkage; users can immediately generate a fresh event ID to relink.

## Bug 012
- **Date:** 2026-03-11
- **Bug/Error:** Capture requests failed with `Post "https://api.openai.com/v1/chat/completions": context deadline exceeded`.
- **Impact:** `Capture and Save` could fail intermittently or consistently for larger screenshots/slow API responses.
- **Reproduction Steps:** Use backend default `REQUEST_TIMEOUT_SECONDS=20`, submit an image-based capture, and observe timeout error in API response/logs.
- **Root Cause:** OpenAI client timeout and request context timeout were both tied to generic `REQUEST_TIMEOUT_SECONDS`; 20 seconds was too aggressive for some model calls.
- **Resolution Method:** Added dedicated `AI_REQUEST_TIMEOUT_SECONDS` (default 60s), used it for OpenAI client and AI-heavy endpoints (`/v1/captures`, `/v1/query`), and improved timeout errors/status (`504` with actionable message).
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** If needed, increase `AI_REQUEST_TIMEOUT_SECONDS` in `.env` for slower networks or larger image payloads.

## Bug 013
- **Date:** 2026-03-12
- **Bug/Error:** Desktop app failures were often only written to the slim status bar or logs, so backend connection problems and unexpected renderer errors were easy to miss.
- **Impact:** Users could trigger capture/auth/recall actions and not receive a clear popup explaining that the backend was unreachable or that the app hit an unexpected error.
- **Reproduction Steps:** Stop the backend and attempt login/capture/recall from the desktop app, or trigger an uncaught renderer exception.
- **Root Cause:** Handled async failures updated `status` only, background startup failures could be silent, and there was no shared popup/error-boundary path for unexpected frontend failures.
- **Resolution Method:** Added a reusable renderer error popup, routed key request failures through it, preserved session state on backend connectivity failures, added global frontend error listeners plus a React error boundary, and surfaced Electron process-level failures with native dialogs.
- **Status:** Resolved
- **Owner:** Codex
- **Notes:** Popup messaging now distinguishes backend connection issues from general app errors.
