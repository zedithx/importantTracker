package store

import (
	"sync"

	"importanttracker/backend/internal/model"
)

type MemoryStore struct {
	mu     sync.RWMutex
	byUser map[string][]model.CaptureRecord
	byID   map[string]model.CaptureRecord
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byUser: make(map[string][]model.CaptureRecord),
		byID:   make(map[string]model.CaptureRecord),
	}
}

func (s *MemoryStore) SaveCapture(record model.CaptureRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.byID[record.ID] = record
	s.byUser[record.UserID] = append(s.byUser[record.UserID], record)
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
