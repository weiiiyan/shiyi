import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/ankiService.js', () => ({
  default: {
    getShiYiDecks: vi.fn(),
    isAvailable: vi.fn(),
    getAllDeckNames: vi.fn(),
  },
}));

import app from '../index.js';
import ankiService from '../services/ankiService.js';

describe('Deck Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/decks', () => {
    it('returns deck list', async () => {
      ankiService.getShiYiDecks.mockResolvedValueOnce({
        decks: [
          {
            id: 'ShiYi%3A%3ADaily',
            name: 'Daily',
            fullName: 'ShiYi::Daily',
            totalCards: 5,
            newCards: 2,
            reviewCards: 3,
            dueCards: 3,
          },
        ],
        allDecks: ['Default', 'ShiYi::Daily'],
      });

      const res = await request(app).get('/api/decks');

      expect(res.status).toBe(200);
      expect(res.body.decks).toHaveLength(1);
      expect(res.body.decks[0].name).toBe('Daily');
      expect(res.body.allDeckNames).toEqual(['Default', 'ShiYi::Daily']);
    });

    it('returns 500 on service error', async () => {
      ankiService.getShiYiDecks.mockRejectedValueOnce(new Error('Anki not running'));

      const res = await request(app).get('/api/decks');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Anki not running');
    });
  });

  describe('GET /api/decks/status', () => {
    it('returns connection status', async () => {
      ankiService.isAvailable.mockResolvedValueOnce({
        available: true,
        version: '2.1.0',
      });

      const res = await request(app).get('/api/decks/status');

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.version).toBe('2.1.0');
    });

    it('returns available false on Anki down', async () => {
      ankiService.isAvailable.mockResolvedValueOnce({
        available: false,
        version: null,
      });

      const res = await request(app).get('/api/decks/status');

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    it('returns available false on unexpected error (preserves frontend contract)', async () => {
      ankiService.isAvailable.mockRejectedValueOnce(new Error('Network error'));

      const res = await request(app).get('/api/decks/status');

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.error).toBeTruthy();
    });
  });

  describe('GET /api/decks/all', () => {
    it('returns all deck names', async () => {
      ankiService.getAllDeckNames.mockResolvedValueOnce(['Default', 'Other', 'ShiYi::Daily']);

      const res = await request(app).get('/api/decks/all');

      expect(res.status).toBe(200);
      expect(res.body.allDecks).toHaveLength(3);
    });

    it('returns 500 on service error', async () => {
      ankiService.getAllDeckNames.mockRejectedValueOnce(new Error('Failed'));

      const res = await request(app).get('/api/decks/all');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed');
    });
  });
});
