package store

import (
	"fmt"
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
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byUser:             make(map[string][]model.CaptureRecord),
		byID:               make(map[string]model.CaptureRecord),
		telegramLinks:      make(map[string]model.TelegramLinkStatus),
		telegramChatByUser: make(map[string]string),
		telegramUserByChat: make(map[string]string),
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
