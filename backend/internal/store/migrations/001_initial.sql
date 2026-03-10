CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    source_app TEXT NOT NULL DEFAULT '',
    source_title TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    tag TEXT NOT NULL DEFAULT 'other',
    fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captures_user_captured_at
    ON captures (user_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS telegram_links (
    event_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    chat_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL,
    linked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_user_id
    ON telegram_links (user_id);

CREATE TABLE IF NOT EXISTS telegram_chat_links (
    user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    linked_at TIMESTAMPTZ NOT NULL
);
