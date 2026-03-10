package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"importanttracker/backend/internal/model"

	_ "github.com/lib/pq"
)

const defaultStoreTimeout = 10 * time.Second

//go:embed migrations/*.sql
var migrationFS embed.FS

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(
	ctx context.Context,
	dsn string,
	maxOpenConns int,
	maxIdleConns int,
	connMaxLife time.Duration,
) (*PostgresStore, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, fmt.Errorf("postgres dsn is required")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxIdleConns)
	db.SetConnMaxLifetime(connMaxLife)

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	s := &PostgresStore{db: db}
	if err := s.RunMigrations(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return s, nil
}

func (s *PostgresStore) Close() error {
	return s.db.Close()
}

func (s *PostgresStore) RunMigrations(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS snaprecall_schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}

	files, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return fmt.Errorf("list migration files: %w", err)
	}
	sort.Strings(files)

	for _, path := range files {
		version := filepath.Base(path)
		applied, err := s.isMigrationApplied(ctx, version)
		if err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if applied {
			continue
		}

		sqlBytes, err := migrationFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}

		stmt := strings.TrimSpace(string(sqlBytes))
		if stmt == "" {
			continue
		}

		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration tx %s: %w", version, err)
		}

		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", version, err)
		}

		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO snaprecall_schema_migrations (version, applied_at) VALUES ($1, NOW())`,
			version,
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
	}

	return nil
}

func (s *PostgresStore) isMigrationApplied(ctx context.Context, version string) (bool, error) {
	var exists bool
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM snaprecall_schema_migrations WHERE version = $1)`,
		version,
	).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (s *PostgresStore) SaveCapture(record model.CaptureRecord) error {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	fields := record.Fields
	if fields == nil {
		fields = []model.Field{}
	}

	fieldsJSON, err := json.Marshal(fields)
	if err != nil {
		return err
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO captures (
			id,
			user_id,
			captured_at,
			source_app,
			source_title,
			ocr_text,
			summary,
			tag,
			fields_json
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`,
		record.ID,
		strings.TrimSpace(record.UserID),
		record.CapturedAt.UTC(),
		strings.TrimSpace(record.Source.App),
		strings.TrimSpace(record.Source.Title),
		record.OCRText,
		record.Summary,
		record.Tag,
		fieldsJSON,
	)
	return err
}

func (s *PostgresStore) ListCaptures(userID string, limit int) []model.CaptureRecord {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	if limit <= 0 {
		limit = 30
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			id,
			user_id,
			captured_at,
			source_app,
			source_title,
			ocr_text,
			summary,
			tag,
			fields_json
		FROM captures
		WHERE user_id = $1
		ORDER BY captured_at DESC
		LIMIT $2
	`, strings.TrimSpace(userID), limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	records := make([]model.CaptureRecord, 0, limit)
	for rows.Next() {
		var rec model.CaptureRecord
		var fieldsRaw []byte
		if err := rows.Scan(
			&rec.ID,
			&rec.UserID,
			&rec.CapturedAt,
			&rec.Source.App,
			&rec.Source.Title,
			&rec.OCRText,
			&rec.Summary,
			&rec.Tag,
			&fieldsRaw,
		); err != nil {
			return records
		}

		if len(fieldsRaw) > 0 {
			_ = json.Unmarshal(fieldsRaw, &rec.Fields)
		}
		if rec.Fields == nil {
			rec.Fields = []model.Field{}
		}

		records = append(records, rec)
	}

	return records
}

func (s *PostgresStore) GetCapture(id string) (model.CaptureRecord, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var rec model.CaptureRecord
	var fieldsRaw []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT
			id,
			user_id,
			captured_at,
			source_app,
			source_title,
			ocr_text,
			summary,
			tag,
			fields_json
		FROM captures
		WHERE id = $1
	`, strings.TrimSpace(id)).Scan(
		&rec.ID,
		&rec.UserID,
		&rec.CapturedAt,
		&rec.Source.App,
		&rec.Source.Title,
		&rec.OCRText,
		&rec.Summary,
		&rec.Tag,
		&fieldsRaw,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return model.CaptureRecord{}, false
	}
	if err != nil {
		return model.CaptureRecord{}, false
	}

	if len(fieldsRaw) > 0 {
		_ = json.Unmarshal(fieldsRaw, &rec.Fields)
	}
	if rec.Fields == nil {
		rec.Fields = []model.Field{}
	}

	return rec, true
}

func (s *PostgresStore) CreateTelegramLink(link model.TelegramLinkStatus) error {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	status := strings.TrimSpace(link.Status)
	if status == "" {
		status = "pending"
	}
	createdAt := link.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	var linkedAt any
	if link.LinkedAt != nil {
		linkedAt = link.LinkedAt.UTC()
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO telegram_links (
			event_id,
			user_id,
			status,
			chat_id,
			created_at,
			linked_at
		) VALUES ($1,$2,$3,$4,$5,$6)
	`,
		strings.TrimSpace(link.EventID),
		strings.TrimSpace(link.UserID),
		status,
		strings.TrimSpace(link.ChatID),
		createdAt.UTC(),
		linkedAt,
	)
	return err
}

func (s *PostgresStore) GetTelegramLink(eventID string) (model.TelegramLinkStatus, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()
	return s.getTelegramLink(ctx, s.db, strings.TrimSpace(eventID), false)
}

func (s *PostgresStore) ClaimTelegramLink(eventID, chatID string, linkedAt time.Time) (model.TelegramLinkStatus, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return model.TelegramLinkStatus{}, false
	}
	defer tx.Rollback()

	normalizedEventID := strings.TrimSpace(eventID)
	normalizedChatID := strings.TrimSpace(chatID)
	link, ok := s.getTelegramLink(ctx, tx, normalizedEventID, true)
	if !ok {
		return model.TelegramLinkStatus{}, false
	}

	if link.Status != "linked" {
		_, err := tx.ExecContext(ctx, `
			UPDATE telegram_links
			SET status = 'linked',
			    chat_id = $2,
			    linked_at = $3
			WHERE event_id = $1
		`, normalizedEventID, normalizedChatID, linkedAt.UTC())
		if err != nil {
			return model.TelegramLinkStatus{}, false
		}

		link.Status = "linked"
		link.ChatID = normalizedChatID
		linkedAtUTC := linkedAt.UTC()
		link.LinkedAt = &linkedAtUTC
	}

	if link.Status == "linked" && link.ChatID != "" {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO telegram_chat_links (
				user_id,
				chat_id,
				linked_at
			) VALUES ($1,$2,$3)
			ON CONFLICT (user_id)
			DO UPDATE SET
				chat_id = EXCLUDED.chat_id,
				linked_at = EXCLUDED.linked_at
		`, link.UserID, link.ChatID, linkedAt.UTC())
		if err != nil {
			return model.TelegramLinkStatus{}, false
		}
	}

	if err := tx.Commit(); err != nil {
		return model.TelegramLinkStatus{}, false
	}

	return link, true
}

func (s *PostgresStore) GetTelegramChatIDByUser(userID string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var chatID string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT chat_id FROM telegram_chat_links WHERE user_id = $1`,
		strings.TrimSpace(userID),
	).Scan(&chatID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false
	}
	if err != nil {
		return "", false
	}
	return chatID, true
}

func (s *PostgresStore) GetUserIDByTelegramChatID(chatID string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var userID string
	err := s.db.QueryRowContext(
		ctx,
		`SELECT user_id FROM telegram_chat_links WHERE chat_id = $1`,
		strings.TrimSpace(chatID),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false
	}
	if err != nil {
		return "", false
	}
	return userID, true
}

type rowQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func (s *PostgresStore) getTelegramLink(
	ctx context.Context,
	q rowQueryer,
	eventID string,
	forUpdate bool,
) (model.TelegramLinkStatus, bool) {
	query := `
		SELECT
			event_id,
			user_id,
			status,
			chat_id,
			created_at,
			linked_at
		FROM telegram_links
		WHERE event_id = $1
	`
	if forUpdate {
		query += " FOR UPDATE"
	}

	var link model.TelegramLinkStatus
	var linkedAt sql.NullTime
	err := q.QueryRowContext(ctx, query, eventID).Scan(
		&link.EventID,
		&link.UserID,
		&link.Status,
		&link.ChatID,
		&link.CreatedAt,
		&linkedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return model.TelegramLinkStatus{}, false
	}
	if err != nil {
		return model.TelegramLinkStatus{}, false
	}

	if linkedAt.Valid {
		t := linkedAt.Time.UTC()
		link.LinkedAt = &t
	}

	return link, true
}
