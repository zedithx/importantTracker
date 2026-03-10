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
