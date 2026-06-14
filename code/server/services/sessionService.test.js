import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sessionService from './sessionService.js';

describe('sessionService', () => {
  const deckId = 'test-deck';
  const aiConfig = { provider: 'qwen', apiKey: 'sk-test' };
  const proficiencyConfig = { levels: [], selected: {} };

  // Clean up sessions between tests
  afterEach(() => {
    sessionService.deleteSession(deckId);
    sessionService.deleteSession('deck2');
  });

  describe('createSession', () => {
    it('creates a session with correct initial state', () => {
      const session = sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      expect(session.deckId).toBe(deckId);
      expect(session.aiConfig).toEqual(aiConfig);
      expect(session.proficiencyConfig).toEqual(proficiencyConfig);
      expect(session.currentCard).toBeNull();
      expect(session.history).toEqual([]);
      expect(session.scenario).toBeNull();
      expect(session.failCount).toBe(0);
      expect(session.lastCardType).toBeNull();
      expect(session.scenarioHistory).toEqual({});
      expect(session.completedCards).toEqual([]);
      expect(session.scores).toEqual({ again: 0, good: 0, easy: 0 });
      expect(session.startedAt).toBeGreaterThan(0);
    });

    it('replaces existing session for same deckId', () => {
      const session1 = sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session2 = sessionService.createSession(deckId, { provider: 'openai' }, proficiencyConfig);
      expect(session2).not.toBe(session1);
      expect(session2.aiConfig.provider).toBe('openai');
      expect(sessionService.getSession(deckId)).toBe(session2);
    });
  });

  describe('getSession', () => {
    it('returns session for known deckId', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      expect(session).toBeDefined();
      expect(session.deckId).toBe(deckId);
    });

    it('returns undefined for unknown deckId', () => {
      expect(sessionService.getSession('nonexistent')).toBeUndefined();
    });

    it('refreshes TTL timer on access', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session1 = sessionService.getSession(deckId);
      const timer1 = session1.timer;
      const session2 = sessionService.getSession(deckId);
      // Timer should be refreshed (new timer)
      expect(session2.timer).not.toBe(timer1);
    });
  });

  describe('deleteSession', () => {
    it('removes session', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.deleteSession(deckId);
      expect(sessionService.getSession(deckId)).toBeUndefined();
    });

    it('is safe to call on nonexistent session', () => {
      expect(() => sessionService.deleteSession('nonexistent')).not.toThrow();
    });
  });

  describe('setCurrentCard', () => {
    it('sets current card and formats scenario message', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const card = { cardId: 1, word: 'hello', concept: '你好', cardType: 'read', type: 0 };
      const scenario = { scenario: 'Hello there!', question: 'What does it mean?' };

      const result = sessionService.setCurrentCard(deckId, card, scenario);
      expect(result).toBe(true);

      const session = sessionService.getSession(deckId);
      expect(session.currentCard).toEqual(card);
      expect(session.scenario).toEqual(scenario);
      expect(session.history).toHaveLength(1);
      expect(session.history[0].role).toBe('assistant');
      expect(session.history[0].content).toContain('Hello there!');
      expect(session.failCount).toBe(0);
    });

    it('returns false for nonexistent session', () => {
      const result = sessionService.setCurrentCard('nonexistent', {}, {});
      expect(result).toBe(false);
    });

    it('resets history and failCount when setting new card', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      session.history = [{ role: 'user', content: 'old msg' }];
      session.failCount = 3;

      sessionService.setCurrentCard(deckId, { cardId: 1, word: 'test', cardType: 'read', type: 0 }, { scenario: 'new' });
      expect(session.history).toHaveLength(1);
      expect(session.failCount).toBe(0);
    });
  });

  describe('addMessage', () => {
    it('adds message to session history', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.addMessage(deckId, 'user', 'my response');
      const session = sessionService.getSession(deckId);
      expect(session.history).toHaveLength(1);
      expect(session.history[0]).toEqual({ role: 'user', content: 'my response' });
    });

    it('is safe to call on nonexistent session', () => {
      expect(() => sessionService.addMessage('nonexistent', 'user', 'hi')).not.toThrow();
    });
  });

  describe('recordScore', () => {
    it('records Again (ease=1) and increments failCount', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.recordScore(deckId, 1);
      const progress = sessionService.getProgress(deckId);
      expect(progress.scores.again).toBe(1);
      expect(progress.failCount).toBe(1);
    });

    it('records Good (ease=3) and resets failCount', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      session.failCount = 2;
      sessionService.recordScore(deckId, 3);
      const progress = sessionService.getProgress(deckId);
      expect(progress.scores.good).toBe(1);
      expect(progress.failCount).toBe(0);
    });

    it('records Easy (ease=4) and resets failCount', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.recordScore(deckId, 4);
      const progress = sessionService.getProgress(deckId);
      expect(progress.scores.easy).toBe(1);
      expect(progress.failCount).toBe(0);
    });

    it('ignores unknown ease values', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.recordScore(deckId, 2); // not used in this app
      const progress = sessionService.getProgress(deckId);
      expect(progress.scores.again).toBe(0);
      expect(progress.scores.good).toBe(0);
      expect(progress.scores.easy).toBe(0);
    });
  });

  describe('markCardComplete', () => {
    it('adds cardId to completedCards', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.markCardComplete(deckId, 42);
      const session = sessionService.getSession(deckId);
      expect(session.completedCards).toContain(42);
    });

    it('is safe to call on nonexistent session', () => {
      expect(() => sessionService.markCardComplete('nonexistent', 1)).not.toThrow();
    });
  });

  describe('getProgress', () => {
    it('returns null for nonexistent session', () => {
      expect(sessionService.getProgress('nonexistent')).toBeNull();
    });

    it('returns correct completion count and scores', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.markCardComplete(deckId, 1);
      sessionService.markCardComplete(deckId, 2);
      sessionService.recordScore(deckId, 3);
      sessionService.recordScore(deckId, 4);

      const progress = sessionService.getProgress(deckId);
      expect(progress.completed).toBe(2);
      expect(progress.scores.good).toBe(1);
      expect(progress.scores.easy).toBe(1);
    });

    it('returns startedAt timestamp', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const progress = sessionService.getProgress(deckId);
      expect(progress.startedAt).toBeGreaterThan(0);
    });
  });

  describe('recordScenario / getPreviousScenarios', () => {
    it('records and retrieves scenario hashes for a word', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const scenario = { scenario: 'test scenario', question: 'test?' };

      sessionService.recordScenario(deckId, 'hello', scenario);
      const previous = sessionService.getPreviousScenarios(deckId, 'hello');
      expect(previous).toHaveLength(1);
    });

    it('does not record duplicate hashes for same word', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const scenario = { scenario: 'test', question: 'q?' };

      sessionService.recordScenario(deckId, 'hello', scenario);
      sessionService.recordScenario(deckId, 'hello', scenario);
      const previous = sessionService.getPreviousScenarios(deckId, 'hello');
      expect(previous).toHaveLength(1);
    });

    it('returns empty array for unknown word', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      expect(sessionService.getPreviousScenarios(deckId, 'unknown')).toEqual([]);
    });

    it('returns empty array for nonexistent session', () => {
      expect(sessionService.getPreviousScenarios('nonexistent', 'hello')).toEqual([]);
    });
  });

  describe('pickNextCard', () => {
    function makeCard(cardId, cardType, word) {
      return { cardId, cardType, word: word || `word-${cardId}` };
    }

    it('returns null for empty array', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      expect(sessionService.pickNextCard([], session)).toBeNull();
    });

    it('returns null for null/undefined cards', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      expect(sessionService.pickNextCard(null, session)).toBeNull();
      expect(sessionService.pickNextCard(undefined, session)).toBeNull();
    });

    it('returns the only card when single card present', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      const cards = [makeCard(1, 'read')];
      const result = sessionService.pickNextCard(cards, session);
      expect(result.cardId).toBe(1);
    });

    it('rotates card types across calls', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      const cards = [
        makeCard(1, 'read'),
        makeCard(2, 'write'),
        makeCard(3, 'listen'),
        makeCard(4, 'speak'),
      ];

      // First call: lastCardType is null → startIdx=0 → read
      const first = sessionService.pickNextCard(cards, session);
      expect(first.cardType).toBe('read');
      expect(session.lastCardType).toBe('read');

      // Second call: startIdx = indexOf('read')+1 = 1 → write
      const second = sessionService.pickNextCard(cards, session);
      expect(second.cardType).toBe('write');
      expect(session.lastCardType).toBe('write');

      // Third call: startIdx = indexOf('write')+1 = 2 → listen
      const third = sessionService.pickNextCard(cards, session);
      expect(third.cardType).toBe('listen');
      expect(session.lastCardType).toBe('listen');

      // Fourth call: startIdx = indexOf('listen')+1 = 3 → speak
      const fourth = sessionService.pickNextCard(cards, session);
      expect(fourth.cardType).toBe('speak');
    });

    it('skips empty types and falls through', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      const cards = [
        makeCard(1, 'read'),
        makeCard(2, 'speak'),
        // no write or listen
      ];

      session.lastCardType = 'read';
      const result = sessionService.pickNextCard(cards, session);
      // Expected: read→write (empty)→listen (empty)→speak
      expect(result.cardType).toBe('speak');
    });

    it('maps unknown card types to read', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      const cards = [{ cardId: 99, cardType: 'unknown_type', word: 'test' }];
      const result = sessionService.pickNextCard(cards, session);
      expect(result.cardId).toBe(99);
      // Should have been treated as 'read'
    });

    it('randomizes within same type', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      const session = sessionService.getSession(deckId);
      const cards = [
        makeCard(1, 'read', 'a'),
        makeCard(2, 'read', 'b'),
        makeCard(3, 'read', 'c'),
      ];

      // Run enough times to verify it doesn't always return the same card
      const results = new Set();
      for (let i = 0; i < 30; i++) {
        session.lastCardType = null; // reset so we always start from read
        const result = sessionService.pickNextCard(cards, session);
        results.add(result.cardId);
      }
      // All 3 cards should appear at some point (probabilistic but 30 tries is plenty)
      expect(results.size).toBe(3);
    });
  });

  describe('formatScenarioMessage (via setCurrentCard)', () => {
    it('handles read card type', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'read', type: 0 },
        { scenario: 'Test scenario.', question: 'Test question?' }
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).toContain('Test scenario.');
      expect(msg).toContain('Test question?');
    });

    it('handles write card type with emoji', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'write', type: 0 },
        { scenario: 'Write this.', task: 'Type it.' }
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).toContain('🖊️');
      expect(msg).toContain('Write this.');
      expect(msg).toContain('Type it.');
    });

    it('handles listen card type', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'listen', type: 0 },
        { audioText: 'Hello world.', question: 'What did you hear?' }
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).toContain('🎧');
      expect(msg).toContain('Hello world.');
    });

    it('handles speak card type', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'speak', type: 0 },
        { scenario: 'Say this.', task: 'Speak it.' }
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).toContain('🗣️');
      expect(msg).toContain('Say this.');
    });

    it('handles missing fields without "undefined" text', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'read', type: 0 },
        {} // empty scenario
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).not.toContain('undefined');
    });

    it('shows hint when present', () => {
      sessionService.createSession(deckId, aiConfig, proficiencyConfig);
      sessionService.setCurrentCard(
        deckId,
        { cardId: 1, word: 'test', cardType: 'read', type: 0 },
        { scenario: 'Test.', question: 'Q?', hint: 'Think about it.' }
      );
      const msg = sessionService.getSession(deckId).history[0].content;
      expect(msg).toContain('💡 Hint');
      expect(msg).toContain('Think about it.');
    });
  });
});
