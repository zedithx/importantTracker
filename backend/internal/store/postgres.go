package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"importanttracker/backend/internal/model"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/lib/pq"
	gormpostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	gormlogger "gorm.io/gorm/logger"
)

const (
	defaultStoreTimeout     = 10 * time.Second
	defaultSlowSQLThreshold = 300 * time.Millisecond
	defaultMaxOpenConns     = 10
	defaultMaxIdleConns     = 5
	defaultConnMaxLife      = 30 * time.Minute
	maxWarmConnections      = 5
	appSchemaName           = "public"
	appMigrationsTable      = "schema_migrations"
	defaultConnectTimeout   = 10

	captureSelectColumns       = "id,user_id,captured_at,source_app,source_title,ocr_text,summary,tag,fields_json"
	recentCaptureSelectColumns = "id,user_id,captured_at,source_app,source_title,summary,tag,fields_json"
	userSelectColumns          = "id,email,password_hash,created_at"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type PostgresStore struct {
	db *gorm.DB
}

type jsonbPayload []byte

func (p jsonbPayload) Value() (driver.Value, error) {
	if len(p) == 0 {
		return "[]", nil
	}
	if !json.Valid(p) {
		return nil, fmt.Errorf("invalid jsonb payload")
	}
	return string(p), nil
}

func (p *jsonbPayload) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*p = jsonbPayload([]byte("[]"))
		return nil
	case []byte:
		if len(v) == 0 {
			*p = jsonbPayload([]byte("[]"))
			return nil
		}
		out := make([]byte, len(v))
		copy(out, v)
		*p = jsonbPayload(out)
		return nil
	case string:
		if strings.TrimSpace(v) == "" {
			*p = jsonbPayload([]byte("[]"))
			return nil
		}
		*p = jsonbPayload([]byte(v))
		return nil
	default:
		return fmt.Errorf("unsupported jsonb payload type %T", value)
	}
}

type captureRow struct {
	ID          string       `gorm:"column:id;type:text;primaryKey"`
	UserID      string       `gorm:"column:user_id;type:text;not null"`
	CapturedAt  time.Time    `gorm:"column:captured_at;not null"`
	SourceApp   string       `gorm:"column:source_app;type:text;not null;default:''"`
	SourceTitle string       `gorm:"column:source_title;type:text;not null;default:''"`
	OCRText     string       `gorm:"column:ocr_text;type:text;not null;default:''"`
	Summary     string       `gorm:"column:summary;type:text;not null;default:''"`
	Tag         string       `gorm:"column:tag;type:text;not null;default:'other'"`
	FieldsJSON  jsonbPayload `gorm:"column:fields_json;type:jsonb;not null"`
	CreatedAt   time.Time    `gorm:"column:created_at;not null"`
}

func (captureRow) TableName() string {
	return "captures"
}

type telegramLinkRow struct {
	EventID   string     `gorm:"column:event_id;type:text;primaryKey"`
	UserID    string     `gorm:"column:user_id;type:text;not null"`
	Status    string     `gorm:"column:status;type:text;not null"`
	ChatID    string     `gorm:"column:chat_id;type:text;not null;default:''"`
	CreatedAt time.Time  `gorm:"column:created_at;not null"`
	LinkedAt  *time.Time `gorm:"column:linked_at"`
}

func (telegramLinkRow) TableName() string {
	return "telegram_links"
}

type telegramChatLinkRow struct {
	UserID   string    `gorm:"column:user_id;type:text;primaryKey"`
	ChatID   string    `gorm:"column:chat_id;type:text;not null;unique"`
	LinkedAt time.Time `gorm:"column:linked_at;not null"`
}

func (telegramChatLinkRow) TableName() string {
	return "telegram_chat_links"
}

type userRow struct {
	ID           string    `gorm:"column:id;type:text;primaryKey"`
	Email        string    `gorm:"column:email;type:text;not null;unique"`
	PasswordHash string    `gorm:"column:password_hash;type:text;not null"`
	CreatedAt    time.Time `gorm:"column:created_at;not null"`
}

func (userRow) TableName() string {
	return "users"
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

	if err := RunPostgresMigrations(dsn); err != nil {
		return nil, err
	}
	dsn = normalizePostgresDSN(dsn)

	maxOpenConns, maxIdleConns, connMaxLife = normalizePoolSettings(maxOpenConns, maxIdleConns, connMaxLife)

	gdb, err := gorm.Open(
		gormpostgres.New(gormpostgres.Config{
			DSN:                  dsn,
			PreferSimpleProtocol: true,
		}),
		&gorm.Config{
			// Each write operation does not need an implicit BEGIN/COMMIT wrapper here.
			// Disabling it removes two round-trips per INSERT/DELETE on remote Postgres.
			SkipDefaultTransaction: true,
			Logger: gormlogger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), gormlogger.Config{
				SlowThreshold:             defaultSlowSQLThreshold,
				LogLevel:                  gormlogger.Warn,
				IgnoreRecordNotFoundError: true,
				ParameterizedQueries:      true,
				Colorful:                  false,
			}),
		},
	)
	if err != nil {
		return nil, err
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(connMaxLife)
	sqlDB.SetConnMaxIdleTime(minDuration(10*time.Minute, connMaxLife))

	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}

	// Warm idle connections so the first few user requests avoid TLS/login handshake spikes.
	warmCtx, warmCancel := context.WithTimeout(ctx, 5*time.Second)
	warmConnectionPool(warmCtx, sqlDB, maxIdleConns)
	warmCancel()

	return &PostgresStore{db: gdb}, nil
}

func (s *PostgresStore) Close() error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func runMigrations(dsn string) error {
	rawDB, err := sql.Open("postgres", dsn)
	if err != nil {
		return err
	}
	defer rawDB.Close()

	driver, err := postgres.WithInstance(rawDB, &postgres.Config{
		SchemaName:      appSchemaName,
		MigrationsTable: appMigrationsTable,
	})
	if err != nil {
		return fmt.Errorf("create migration db driver: %w", err)
	}

	sourceDriver, err := iofs.New(migrationFS, "migrations")
	if err != nil {
		return fmt.Errorf("create migration source driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", sourceDriver, "postgres", driver)
	if err != nil {
		return fmt.Errorf("create migration runner: %w", err)
	}

	upErr := m.Up()
	sourceErr, dbErr := m.Close()
	if upErr != nil && !errors.Is(upErr, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", upErr)
	}
	if sourceErr != nil {
		return fmt.Errorf("close migration source: %w", sourceErr)
	}
	if dbErr != nil {
		return fmt.Errorf("close migration db: %w", dbErr)
	}

	return nil
}

func RunPostgresMigrations(dsn string) error {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return fmt.Errorf("postgres dsn is required")
	}
	return runMigrations(normalizePostgresDSN(dsn))
}

func normalizePostgresDSN(dsn string) string {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return dsn
	}

	query := parsed.Query()
	if strings.TrimSpace(query.Get("search_path")) == "" {
		query.Set("search_path", appSchemaName)
	}
	if strings.TrimSpace(query.Get("connect_timeout")) == "" {
		query.Set("connect_timeout", fmt.Sprintf("%d", defaultConnectTimeout))
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func normalizePoolSettings(maxOpenConns, maxIdleConns int, connMaxLife time.Duration) (int, int, time.Duration) {
	if maxOpenConns <= 0 {
		maxOpenConns = defaultMaxOpenConns
	}
	if maxIdleConns <= 0 {
		maxIdleConns = defaultMaxIdleConns
	}
	if maxIdleConns > maxOpenConns {
		maxIdleConns = maxOpenConns
	}
	if connMaxLife <= 0 {
		connMaxLife = defaultConnMaxLife
	}
	return maxOpenConns, maxIdleConns, connMaxLife
}

func warmConnectionPool(ctx context.Context, db *sql.DB, target int) {
	if target > maxWarmConnections {
		target = maxWarmConnections
	}
	if target <= 1 {
		return
	}

	conns := make([]*sql.Conn, 0, target-1)
	defer func() {
		for _, conn := range conns {
			_ = conn.Close()
		}
	}()

	for i := 0; i < target-1; i++ {
		conn, err := db.Conn(ctx)
		if err != nil {
			return
		}
		if err := conn.PingContext(ctx); err != nil {
			_ = conn.Close()
			return
		}
		conns = append(conns, conn)
	}
}

func minDuration(a, b time.Duration) time.Duration {
	if a <= 0 {
		return b
	}
	if b <= 0 {
		return a
	}
	if a < b {
		return a
	}
	return b
}

func (s *PostgresStore) SaveCapture(record model.CaptureRecord) error {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	fieldsJSON, err := marshalFields(record.Fields)
	if err != nil {
		return err
	}

	row := captureRow{
		ID:          record.ID,
		UserID:      strings.TrimSpace(record.UserID),
		CapturedAt:  record.CapturedAt.UTC(),
		SourceApp:   strings.TrimSpace(record.Source.App),
		SourceTitle: strings.TrimSpace(record.Source.Title),
		OCRText:     record.OCRText,
		Summary:     record.Summary,
		Tag:         record.Tag,
		FieldsJSON:  jsonbPayload(fieldsJSON),
		CreatedAt:   time.Now().UTC(),
	}

	return s.db.WithContext(ctx).Create(&row).Error
}

func (s *PostgresStore) ListCaptures(userID string, limit int) []model.CaptureRecord {
	return s.listCaptures(userID, limit, captureSelectColumns)
}

func (s *PostgresStore) ListRecentCaptures(userID string, limit int) []model.CaptureRecord {
	return s.listCaptures(userID, limit, recentCaptureSelectColumns)
}

func (s *PostgresStore) listCaptures(userID string, limit int, selectColumns string) []model.CaptureRecord {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	if limit <= 0 {
		limit = 30
	}

	var rows []captureRow
	if err := s.db.WithContext(ctx).
		Select(selectColumns).
		Where("user_id = ?", strings.TrimSpace(userID)).
		Order("captured_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil
	}

	out := make([]model.CaptureRecord, 0, len(rows))
	for _, row := range rows {
		out = append(out, captureRowToModel(row))
	}
	return out
}

func (s *PostgresStore) GetCapture(id string) (model.CaptureRecord, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row captureRow
	err := s.db.WithContext(ctx).
		Select(captureSelectColumns).
		Where("id = ?", strings.TrimSpace(id)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.CaptureRecord{}, false
	}
	if err != nil {
		return model.CaptureRecord{}, false
	}

	return captureRowToModel(row), true
}

func (s *PostgresStore) DeleteCapture(userID, captureID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	userID = strings.TrimSpace(userID)
	captureID = strings.TrimSpace(captureID)
	if userID == "" || captureID == "" {
		return false, nil
	}

	tx := s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", captureID, userID).
		Delete(&captureRow{})
	if tx.Error != nil {
		return false, tx.Error
	}

	return tx.RowsAffected > 0, nil
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

	var linkedAt *time.Time
	if link.LinkedAt != nil {
		v := link.LinkedAt.UTC()
		linkedAt = &v
	}

	row := telegramLinkRow{
		EventID:   strings.TrimSpace(link.EventID),
		UserID:    strings.TrimSpace(link.UserID),
		Status:    status,
		ChatID:    strings.TrimSpace(link.ChatID),
		CreatedAt: createdAt.UTC(),
		LinkedAt:  linkedAt,
	}

	return s.db.WithContext(ctx).Create(&row).Error
}

func (s *PostgresStore) GetTelegramLink(eventID string) (model.TelegramLinkStatus, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row telegramLinkRow
	err := s.db.WithContext(ctx).
		Select("event_id,user_id,status,chat_id,created_at,linked_at").
		Where("event_id = ?", strings.TrimSpace(eventID)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.TelegramLinkStatus{}, false
	}
	if err != nil {
		return model.TelegramLinkStatus{}, false
	}

	return telegramLinkRowToModel(row), true
}

func (s *PostgresStore) ClaimTelegramLink(eventID, chatID string, linkedAt time.Time) (model.TelegramLinkStatus, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	normalizedEventID := strings.TrimSpace(eventID)
	normalizedChatID := strings.TrimSpace(chatID)
	linkedAtUTC := linkedAt.UTC()

	var out model.TelegramLinkStatus
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row telegramLinkRow
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("event_id = ?", normalizedEventID).
			Take(&row).Error; err != nil {
			return err
		}

		if row.Status != "linked" {
			if err := tx.Model(&telegramLinkRow{}).
				Where("event_id = ?", normalizedEventID).
				Updates(map[string]any{
					"status":    "linked",
					"chat_id":   normalizedChatID,
					"linked_at": linkedAtUTC,
				}).Error; err != nil {
				return err
			}
			row.Status = "linked"
			row.ChatID = normalizedChatID
			row.LinkedAt = &linkedAtUTC
		}

		if row.Status == "linked" && strings.TrimSpace(row.ChatID) != "" {
			chatLink := telegramChatLinkRow{
				UserID:   row.UserID,
				ChatID:   row.ChatID,
				LinkedAt: linkedAtUTC,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "user_id"}},
				DoUpdates: clause.Assignments(map[string]any{
					"chat_id":   chatLink.ChatID,
					"linked_at": chatLink.LinkedAt,
				}),
			}).Create(&chatLink).Error; err != nil {
				return err
			}
		}

		out = telegramLinkRowToModel(row)
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.TelegramLinkStatus{}, false
	}
	if err != nil {
		return model.TelegramLinkStatus{}, false
	}

	return out, true
}

func (s *PostgresStore) GetTelegramChatIDByUser(userID string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row telegramChatLinkRow
	err := s.db.WithContext(ctx).
		Select("chat_id").
		Where("user_id = ?", strings.TrimSpace(userID)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false
	}
	if err != nil {
		return "", false
	}

	return row.ChatID, true
}

func (s *PostgresStore) GetUserIDByTelegramChatID(chatID string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row telegramChatLinkRow
	err := s.db.WithContext(ctx).
		Select("user_id").
		Where("chat_id = ?", strings.TrimSpace(chatID)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false
	}
	if err != nil {
		return "", false
	}

	return row.UserID, true
}

func (s *PostgresStore) DeleteTelegramChatLinkByUser(userID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	userID = strings.TrimSpace(userID)
	if userID == "" {
		return false, nil
	}

	tx := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Delete(&telegramChatLinkRow{})
	if tx.Error != nil {
		return false, tx.Error
	}

	return tx.RowsAffected > 0, nil
}

func (s *PostgresStore) CreateUser(user model.UserAuth) error {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	row := userRow{
		ID:           strings.TrimSpace(user.ID),
		Email:        strings.ToLower(strings.TrimSpace(user.Email)),
		PasswordHash: user.PasswordHash,
		CreatedAt:    user.CreatedAt.UTC(),
	}

	return s.db.WithContext(ctx).Create(&row).Error
}

func (s *PostgresStore) GetUserByEmail(email string) (model.UserAuth, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row userRow
	err := s.db.WithContext(ctx).
		Select(userSelectColumns).
		Where("email = ?", strings.ToLower(strings.TrimSpace(email))).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.UserAuth{}, false
	}
	if err != nil {
		return model.UserAuth{}, false
	}

	return model.UserAuth{
		ID:           row.ID,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		CreatedAt:    row.CreatedAt.UTC(),
	}, true
}

func (s *PostgresStore) GetUserByID(userID string) (model.UserAuth, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultStoreTimeout)
	defer cancel()

	var row userRow
	err := s.db.WithContext(ctx).
		Select(userSelectColumns).
		Where("id = ?", strings.TrimSpace(userID)).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.UserAuth{}, false
	}
	if err != nil {
		return model.UserAuth{}, false
	}

	return model.UserAuth{
		ID:           row.ID,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		CreatedAt:    row.CreatedAt.UTC(),
	}, true
}

func captureRowToModel(row captureRow) model.CaptureRecord {
	return model.CaptureRecord{
		ID:         row.ID,
		UserID:     row.UserID,
		CapturedAt: row.CapturedAt.UTC(),
		Source: model.SourceMeta{
			App:   row.SourceApp,
			Title: row.SourceTitle,
		},
		OCRText: row.OCRText,
		Summary: row.Summary,
		Tag:     row.Tag,
		Fields:  unmarshalFields([]byte(row.FieldsJSON)),
	}
}

func telegramLinkRowToModel(row telegramLinkRow) model.TelegramLinkStatus {
	out := model.TelegramLinkStatus{
		EventID:   row.EventID,
		UserID:    row.UserID,
		Status:    row.Status,
		ChatID:    row.ChatID,
		CreatedAt: row.CreatedAt.UTC(),
	}
	if row.LinkedAt != nil {
		v := row.LinkedAt.UTC()
		out.LinkedAt = &v
	}
	return out
}

func marshalFields(fields []model.Field) ([]byte, error) {
	if fields == nil {
		fields = []model.Field{}
	}
	return json.Marshal(fields)
}

func unmarshalFields(raw []byte) []model.Field {
	if len(raw) == 0 {
		return []model.Field{}
	}

	var fields []model.Field
	if err := json.Unmarshal(raw, &fields); err != nil {
		return []model.Field{}
	}
	if fields == nil {
		return []model.Field{}
	}
	return fields
}
