import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock all service dependencies before importing the app
vi.mock('../services/ankiService.js', () => ({
  default: {
    getDueCards: vi.fn(),
    getKnownVocabulary: vi.fn(),
    answerCard: vi.fn(),
  },
}));

vi.mock('../services/aiService.js', () => ({
  default: {
    generateScenario: vi.fn(),
    judgeResponse: vi.fn(),
  },
}));

vi.mock('../services/sessionService.js', () => ({
  default: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    setCurrentCard: vi.fn(),
    addMessage: vi.fn(),
    recordScore: vi.fn(),
    markCardComplete: vi.fn(),
    recordScenario: vi.fn(),
    getPreviousScenarios: vi.fn(() => []),
    getProgress: vi.fn(),
    pickNextCard: vi.fn(),
  },
}));

import app from '../index.js';
import ankiService from '../services/ankiService.js';
import aiService from '../services/aiService.js';
import sessionService from '../services/sessionService.js';

describe('Learn Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/learn/start', () => {
    it('returns 500 when deckId is missing (validation error is caught by try/catch)', async () => {
      // The validation throws, which is caught → 500
      const res = await request(app)
        .post('/api/learn/start')
        .send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBeTruthy();
    });

    it('returns done:true when no due cards', async () => {
      ankiService.getDueCards.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/learn/start')
        .send({ deckId: 'ShiYi%3A%3ADaily', aiConfig: {}, proficiencyConfig: null });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(true);
      expect(res.body.message).toContain('没有需要学习');
    });

    it('starts session and returns card with scenario', async () => {
      const mockCard = { cardId: 1, word: 'hello', concept: '你好', cardType: 'read', type: 0 };
      ankiService.getDueCards.mockResolvedValueOnce([mockCard]);
      ankiService.getKnownVocabulary.mockResolvedValueOnce([{ word: 'world', concept: '世界' }]);

      const mockSession = {
        aiConfig: {},
        proficiencyConfig: null,
        lastCardType: null,
        completedCards: [],
      };
      sessionService.createSession.mockReturnValue(mockSession);
      sessionService.getSession.mockReturnValue(mockSession);
      sessionService.pickNextCard.mockReturnValue(mockCard);
      sessionService.getPreviousScenarios.mockReturnValue([]);

      const mockScenario = { scenario: 'Hello there!', question: 'What?' };
      aiService.generateScenario.mockResolvedValueOnce(mockScenario);
      sessionService.setCurrentCard.mockReturnValue(true);

      const res = await request(app)
        .post('/api/learn/start')
        .send({ deckId: 'ShiYi%3A%3ADaily', aiConfig: {}, proficiencyConfig: null });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(false);
      expect(res.body.card.word).toBe('hello');
      expect(res.body.scenario).toEqual(mockScenario);
    });
  });

  describe('POST /api/learn/respond', () => {
    it('returns 500 when deckId is missing', async () => {
      const res = await request(app)
        .post('/api/learn/respond')
        .send({});
      expect(res.status).toBe(500);
    });

    it('returns 400 when no active session', async () => {
      sessionService.getSession.mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/learn/respond')
        .send({ deckId: 'test', response: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('没有活跃');
    });

    it('returns 400 when no current card', async () => {
      sessionService.getSession.mockReturnValue({ currentCard: null });

      const res = await request(app)
        .post('/api/learn/respond')
        .send({ deckId: 'test', response: 'hello' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('没有当前卡片');
    });

    it('judges response and returns feedback', async () => {
      const mockSession = {
        currentCard: { cardType: 'read', word: 'hello', concept: '你好' },
        scenario: { scenario: 'Test' },
        history: [],
        failCount: 0,
        aiConfig: { provider: 'test' },
        proficiencyConfig: null,
      };
      sessionService.getSession.mockReturnValue(mockSession);
      aiService.judgeResponse.mockResolvedValueOnce({ ease: 3, feedback: 'Good understanding.' });

      const res = await request(app)
        .post('/api/learn/respond')
        .send({ deckId: 'test', response: 'Hello!' });

      expect(res.status).toBe(200);
      expect(res.body.judgment.ease).toBe(3);
      expect(res.body.judgment.feedback).toBe('Good understanding.');
    });
  });

  describe('POST /api/learn/complete', () => {
    it('returns 500 when ease is invalid', async () => {
      const res = await request(app)
        .post('/api/learn/complete')
        .send({ deckId: 'test', ease: 10 });
      expect(res.status).toBe(500);
    });

    it('returns session expired when no session', async () => {
      sessionService.getSession.mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/learn/complete')
        .send({ deckId: 'test', ease: 3 });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(true);
      expect(res.body.message).toContain('会话已过期');
    });

    it('completes card and returns progress', async () => {
      sessionService.getSession.mockReturnValue({
        currentCard: { cardId: 42 },
      });
      ankiService.answerCard.mockResolvedValueOnce([true]);
      sessionService.getProgress.mockReturnValue({
        completed: 1,
        scores: { again: 0, good: 1, easy: 0 },
        failCount: 0,
        startedAt: Date.now(),
      });

      const res = await request(app)
        .post('/api/learn/complete')
        .send({ deckId: 'test', ease: 3 });

      expect(res.status).toBe(200);
      expect(res.body.cardCompleted).toBe(true);
      expect(res.body.progress).toBeDefined();
      expect(ankiService.answerCard).toHaveBeenCalledWith(42, 3);
    });
  });

  describe('POST /api/learn/next', () => {
    it('returns 400 when no session', async () => {
      sessionService.getSession.mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/learn/next')
        .send({ deckId: 'test' });

      expect(res.status).toBe(400);
    });

    it('returns done:true when all cards completed', async () => {
      const mockSession = { completedCards: [1, 2, 3], aiConfig: {}, proficiencyConfig: null };
      sessionService.getSession.mockReturnValue(mockSession);
      ankiService.getDueCards.mockResolvedValueOnce([
        { cardId: 1 }, { cardId: 2 }, { cardId: 3 },
      ]);
      sessionService.getProgress.mockReturnValue({ completed: 3, scores: {} });

      const res = await request(app)
        .post('/api/learn/next')
        .send({ deckId: 'test' });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(true);
      expect(res.body.message).toContain('全部学完');
    });

    it('returns next card with scenario', async () => {
      const mockSession = {
        completedCards: [],
        aiConfig: {},
        proficiencyConfig: null,
        lastCardType: null,
      };
      sessionService.getSession.mockReturnValue(mockSession);
      ankiService.getDueCards.mockResolvedValueOnce([
        { cardId: 1, word: 'test', concept: '测试', cardType: 'write', type: 0 },
      ]);
      ankiService.getKnownVocabulary.mockResolvedValueOnce([]);

      const mockCard = { cardId: 1, word: 'test', concept: '测试', cardType: 'write', type: 0 };
      sessionService.pickNextCard.mockReturnValue(mockCard);
      sessionService.getPreviousScenarios.mockReturnValue([]);

      const mockScenario = { scenario: 'Write this.', task: 'Type it.' };
      aiService.generateScenario.mockResolvedValueOnce(mockScenario);
      sessionService.setCurrentCard.mockReturnValue(true);
      sessionService.getProgress.mockReturnValue({ completed: 0, scores: {} });

      const res = await request(app)
        .post('/api/learn/next')
        .send({ deckId: 'test' });

      expect(res.status).toBe(200);
      expect(res.body.done).toBe(false);
      expect(res.body.card).toBeDefined();
      expect(res.body.progress).toBeDefined();
    });
  });

  describe('GET /api/learn/progress', () => {
    it('returns 500 when deckId missing', async () => {
      const res = await request(app)
        .get('/api/learn/progress');
      expect(res.status).toBe(500);
    });

    it('returns inactive when no session', async () => {
      sessionService.getProgress.mockReturnValue(null);

      const res = await request(app)
        .get('/api/learn/progress')
        .query({ deckId: 'test' });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(false);
    });

    it('returns active progress', async () => {
      const mockProgress = {
        completed: 5,
        scores: { again: 1, good: 3, easy: 1 },
        failCount: 0,
        startedAt: Date.now(),
      };
      sessionService.getProgress.mockReturnValue(mockProgress);

      const res = await request(app)
        .get('/api/learn/progress')
        .query({ deckId: 'test' });

      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.completed).toBe(5);
    });
  });
});
