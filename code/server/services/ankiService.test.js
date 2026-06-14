import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We import the module after setting up fetch mock
// The module reads process.env on load, so we don't need to re-import
import ankiService from './ankiService.js';

describe('ankiService', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockAnkiResponse(result) {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result, error: null }),
    });
  }

  function mockAnkiError(errorMsg) {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: null, error: errorMsg }),
    });
  }

  describe('isAvailable', () => {
    it('returns available true on successful version check', async () => {
      mockAnkiResponse('2.1.0');
      const result = await ankiService.isAvailable();
      expect(result.available).toBe(true);
      expect(result.version).toBe('2.1.0');
    });

    it('returns available false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await ankiService.isAvailable();
      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('getAllDeckNames', () => {
    it('returns all deck names', async () => {
      mockAnkiResponse(['Default', 'ShiYi::Daily', 'Other']);
      const result = await ankiService.getAllDeckNames();
      expect(result).toEqual(['Default', 'ShiYi::Daily', 'Other']);
    });

    it('invokes deckNames action', async () => {
      mockAnkiResponse([]);
      await ankiService.getAllDeckNames();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.action).toBe('deckNames');
      expect(callBody.version).toBe(6);
    });
  });

  describe('getShiYiDecks', () => {
    it('returns empty when no ShiYi decks exist', async () => {
      mockAnkiResponse(['Default', 'Other']);
      const result = await ankiService.getShiYiDecks();
      expect(result.decks).toEqual([]);
    });

    it('returns ShiYi decks with stats', async () => {
      // First call: deckNames
      mockAnkiResponse(['ShiYi', 'ShiYi::Daily', 'Other']);
      // Second call: findCards all
      mockAnkiResponse([1, 2, 3]);
      // Third call: findCards due
      mockAnkiResponse([1]);
      // Fourth call: findCards new
      mockAnkiResponse([2]);
      // Fifth call: cardsInfo
      mockAnkiResponse([
        { cardId: 1, deckName: 'ShiYi::Daily' },
        { cardId: 2, deckName: 'ShiYi::Daily' },
        { cardId: 3, deckName: 'ShiYi' },
      ]);

      const result = await ankiService.getShiYiDecks();
      expect(result.decks.length).toBeGreaterThan(0);
      expect(result.decks[0]).toHaveProperty('name');
      expect(result.decks[0]).toHaveProperty('fullName');
      expect(result.decks[0]).toHaveProperty('totalCards');
    });
  });

  describe('getDueCards', () => {
    it('returns empty array when no due cards', async () => {
      mockAnkiResponse([]);
      const result = await ankiService.getDueCards('ShiYi::Daily');
      expect(result).toEqual([]);
    });

    it('fetches cards with notes when due cards exist', async () => {
      // findCards
      mockFetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ result: [100], error: null }) })
        // cardsInfo
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [{ cardId: 100, note: 200, deckName: 'ShiYi::Daily', type: 0, due: 0, interval: 0, ease: 0 }],
            error: null,
          }),
        })
        // notesInfo
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [{
              noteId: 200,
              fields: {
                Word: { value: 'hello' },
                Concept: { value: '打招呼' },
                CardType: { value: 'read' },
                SubDeck: { value: 'Daily' },
                Examples: { value: '["example1"]' },
                Context: { value: 'daily' },
              },
            }],
            error: null,
          }),
        });

      const result = await ankiService.getDueCards('ShiYi::Daily');
      expect(result).toHaveLength(1);
      expect(result[0].word).toBe('hello');
      expect(result[0].concept).toBe('打招呼');
      expect(result[0].cardType).toBe('read');
    });
  });

  describe('answerCard', () => {
    it('sends answer with correct ease', async () => {
      mockAnkiResponse([true]);
      await ankiService.answerCard(100, 3);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.action).toBe('answerCards');
      expect(callBody.params.answers).toEqual([{ cardId: 100, ease: 3 }]);
    });

    it('clamps ease to 1-4 range', async () => {
      mockAnkiResponse([true]);
      await ankiService.answerCard(100, 10);
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.params.answers[0].ease).toBe(4);

      mockAnkiResponse([true]);
      await ankiService.answerCard(100, 0);
      const callBody2 = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(callBody2.params.answers[0].ease).toBe(1);
    });
  });

  describe('getKnownVocabulary', () => {
    it('returns unique word/concept pairs', async () => {
      mockFetch
        // findNotes
        .mockResolvedValueOnce({ json: () => Promise.resolve({ result: [1, 2], error: null }) })
        // notesInfo
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [
              { noteId: 1, fields: { Word: { value: 'hello' }, Concept: { value: '你好' } } },
              { noteId: 2, fields: { Word: { value: 'world' }, Concept: { value: '世界' } } },
            ],
            error: null,
          }),
        });

      const result = await ankiService.getKnownVocabulary('ShiYi::Daily');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ word: 'hello', concept: '你好' });
    });

    it('deduplicates identical words', async () => {
      mockFetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ result: [1, 2], error: null }) })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [
              { noteId: 1, fields: { Word: { value: 'hello' }, Concept: { value: '你好' } } },
              { noteId: 2, fields: { Word: { value: 'hello' }, Concept: { value: '你好' } } },
            ],
            error: null,
          }),
        });

      const result = await ankiService.getKnownVocabulary('ShiYi::Daily');
      expect(result).toHaveLength(1);
    });
  });

  describe('invoke error handling', () => {
    it('throws on Anki-Connect error response', async () => {
      mockAnkiError('invalid action');
      await expect(ankiService.getAllDeckNames()).rejects.toThrow('Anki-Connect error');
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(ankiService.getAllDeckNames()).rejects.toThrow('Connection refused');
    });
  });

  describe('allCardsInDeck', () => {
    it('fetches all cards regardless of status', async () => {
      mockFetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ result: [101, 102], error: null }) })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [
              { cardId: 101, note: 201, deckName: 'ShiYi', type: 2, due: 1000, interval: 7, ease: 2.5 },
              { cardId: 102, note: 202, deckName: 'ShiYi', type: 1, due: 0, interval: 0, ease: 0 },
            ],
            error: null,
          }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            result: [
              { noteId: 201, fields: {} },
              { noteId: 202, fields: {} },
            ],
            error: null,
          }),
        });

      const result = await ankiService.getAllCardsInDeck('ShiYi');
      expect(result).toHaveLength(2);
    });
  });
});
