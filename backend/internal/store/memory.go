package store

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"importanttracker/backend/internal/model"
)

type MemoryStore struct {
	mu                 sync.RWMutex
	byUser             map[string][]model.CaptureRecord
	byID               map[string]model.CaptureRecord
	telegramLinks      map[string]model.TelegramLinkStatus
	telegramChatByUser map[string]string
	telegramUserByChat map[string]string
	usersByID          map[string]model.UserAuth
	usersByEmail       map[string]string
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byUser:             make(map[string][]model.CaptureRecord),
		byID:               make(map[string]model.CaptureRecord),
		telegramLinks:      make(map[string]model.TelegramLinkStatus),
		telegramChatByUser: make(map[string]string),
		telegramUserByChat: make(map[string]string),
		usersByID:          make(map[string]model.UserAuth),
		usersByEmail:       make(map[string]string),
	}
}

func (s *MemoryStore) SaveCapture(record model.CaptureRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.byID[record.ID] = record
	s.byUser[record.UserID] = append(s.byUser[record.UserID], record)
	return nil
}

func (s *MemoryStore) ListCaptures(userID string, limit int) []model.CaptureRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := s.byUser[userID]
	if len(records) == 0 {
		return nil
	}

	if limit <= 0 || limit > len(records) {
		limit = len(records)
	}

	result := make([]model.CaptureRecord, 0, limit)
	for i := len(records) - 1; i >= 0 && len(result) < limit; i-- {
		result = append(result, records[i])
	}
	return result
}

func (s *MemoryStore) GetCapture(id string) (model.CaptureRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	record, ok := s.byID[id]
	return record, ok
}

func (s *MemoryStore) DeleteCapture(userID, captureID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID = strings.TrimSpace(userID)
	captureID = strings.TrimSpace(captureID)
	if userID == "" || captureID == "" {
		return false, nil
	}

	record, ok := s.byID[captureID]
	if !ok || record.UserID != userID {
		return false, nil
	}

	delete(s.byID, captureID)

	records := s.byUser[userID]
	filtered := make([]model.CaptureRecord, 0, len(records))
	for _, item := range records {
		if item.ID != captureID {
			filtered = append(filtered, item)
		}
	}

	if len(filtered) == 0 {
		delete(s.byUser, userID)
	} else {
		s.byUser[userID] = filtered
	}

	return true, nil
}

func (s *MemoryStore) CreateTelegramLink(link model.TelegramLinkStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.telegramLinks[link.EventID]; exists {
		return fmt.Errorf("telegram event_id already exists")
	}

	s.telegramLinks[link.EventID] = link
	return nil
}

func (s *MemoryStore) GetTelegramLink(eventID string) (model.TelegramLinkStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	link, ok := s.telegramLinks[eventID]
	return link, ok
}

func (s *MemoryStore) ClaimTelegramLink(eventID, chatID string, linkedAt time.Time) (model.TelegramLinkStatus, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	link, ok := s.telegramLinks[eventID]
	if !ok {
		return model.TelegramLinkStatus{}, false
	}
	if link.Status == "linked" {
		return link, true
	}

	link.Status = "linked"
	link.ChatID = chatID
	link.LinkedAt = &linkedAt
	link.CreatedAt = link.CreatedAt.UTC()

	s.telegramLinks[eventID] = link
	s.telegramChatByUser[link.UserID] = chatID
	s.telegramUserByChat[chatID] = link.UserID

	return link, true
}

func (s *MemoryStore) GetTelegramChatIDByUser(userID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	chatID, ok := s.telegramChatByUser[userID]
	return chatID, ok
}

func (s *MemoryStore) GetUserIDByTelegramChatID(chatID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	userID, ok := s.telegramUserByChat[chatID]
	return userID, ok
}

func (s *MemoryStore) DeleteTelegramChatLinkByUser(userID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID = strings.TrimSpace(userID)
	if userID == "" {
		return false, nil
	}

	chatID, exists := s.telegramChatByUser[userID]
	if !exists {
		return false, nil
	}

	delete(s.telegramChatByUser, userID)
	if strings.TrimSpace(chatID) != "" {
		delete(s.telegramUserByChat, chatID)
	}

	return true, nil
}

func (s *MemoryStore) CreateUser(user model.UserAuth) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	email := strings.ToLower(strings.TrimSpace(user.Email))
	if email == "" {
		return fmt.Errorf("email is required")
	}
	if user.ID == "" {
		return fmt.Errorf("user id is required")
	}
	if _, exists := s.usersByID[user.ID]; exists {
		return fmt.Errorf("duplicate user id")
	}
	if _, exists := s.usersByEmail[email]; exists {
		return fmt.Errorf("duplicate email")
	}

	user.Email = email
	s.usersByID[user.ID] = user
	s.usersByEmail[email] = user.ID
	return nil
}

func (s *MemoryStore) GetUserByEmail(email string) (model.UserAuth, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	normalized := strings.ToLower(strings.TrimSpace(email))
	userID, ok := s.usersByEmail[normalized]
	if !ok {
		return model.UserAuth{}, false
	}

	user, ok := s.usersByID[userID]
	return user, ok
}

func (s *MemoryStore) GetUserByID(userID string) (model.UserAuth, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.usersByID[strings.TrimSpace(userID)]
	return user, ok
}
