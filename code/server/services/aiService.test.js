import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the openai module before importing aiService
const mockCreate = vi.fn();
vi.mock('openai', () => {
  // Must use function declaration (not arrow) so `new OpenAI()` works
  function MockOpenAI() {
    this.chat = { completions: { create: mockCreate } };
  }
  return { default: MockOpenAI };
});

// Mock proficiencyService
vi.mock('./proficiencyService.js', () => ({
  default: {
    buildScenarioProficiency: vi.fn(() => ''),
    buildJudgeProficiency: vi.fn(() => ''),
  },
}));

import aiService from './aiService.js';

describe('aiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MODEL_PRESETS', () => {
    it('has all four providers', () => {
      expect(aiService.MODEL_PRESETS).toHaveProperty('qwen');
      expect(aiService.MODEL_PRESETS).toHaveProperty('doubao');
      expect(aiService.MODEL_PRESETS).toHaveProperty('openai');
      expect(aiService.MODEL_PRESETS).toHaveProperty('custom');
    });

    it('each provider has name, baseURL, models, defaultModel', () => {
      for (const preset of Object.values(aiService.MODEL_PRESETS)) {
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('baseURL');
        expect(preset).toHaveProperty('models');
        expect(preset).toHaveProperty('defaultModel');
      }
    });
  });

  describe('testConnection', () => {
    it('returns ok true on successful connection', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'OK' } }],
      });

      const result = await aiService.testConnection('qwen', 'sk-test', '', 'qwen-plus');
      expect(result.ok).toBe(true);
      expect(result.message).toBe('OK');
    });

    it('returns ok false on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Network error'));

      const result = await aiService.testConnection('qwen', 'sk-test', '', 'qwen-plus');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Network error');
    });

    it('returns ok false when apiKey is missing', async () => {
      // testConnection catches createClient errors internally
      const result = await aiService.testConnection('qwen', '', '', 'qwen-plus');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('API Key 未配置');
    });
  });

  describe('generateScenario', () => {
    const baseParams = {
      cardType: 'read',
      word: 'hello',
      concept: '打招呼',
      knownWords: [{ word: 'world', concept: '世界' }],
      context: 'daily conversation',
      aiConfig: { provider: 'qwen', apiKey: 'sk-test', baseURL: '', model: 'qwen-plus' },
      previousScenarios: [],
      proficiencyConfig: null,
    };

    it('calls AI client and returns parsed scenario', async () => {
      const mockScenario = { scenario: 'Hello there!', question: 'What does hello mean?' };
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(mockScenario) } }],
      });

      const result = await aiService.generateScenario(baseParams);
      expect(result).toEqual(mockScenario);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('handles read card type', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"test","question":"q?"}' } }],
      });

      await aiService.generateScenario({ ...baseParams, cardType: 'read' });

      // Verify the user message includes read-specific instructions
      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;
      expect(userMessage).toContain('READING exercise');
    });

    it('handles write card type', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"test","task":"write"}' } }],
      });

      await aiService.generateScenario({ ...baseParams, cardType: 'write' });

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;
      expect(userMessage).toContain('WRITING exercise');
    });

    it('handles listen card type', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"audioText":"test","question":"q?"}' } }],
      });

      await aiService.generateScenario({ ...baseParams, cardType: 'listen' });

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;
      expect(userMessage).toContain('LISTENING exercise');
    });

    it('handles speak card type', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"test","task":"speak"}' } }],
      });

      await aiService.generateScenario({ ...baseParams, cardType: 'speak' });

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;
      expect(userMessage).toContain('SPEAKING exercise');
    });

    it('appends dedup instruction when previousScenarios exist', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"new scenario","question":"q?"}' } }],
      });

      await aiService.generateScenario({
        ...baseParams,
        previousScenarios: ['hash1', 'hash2'],
      });

      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages[1].content;
      expect(userMessage).toContain('IMPORTANT');
      expect(userMessage).toContain('COMPLETELY DIFFERENT');
    });

    it('uses temperature 0.9 for variety', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"test","question":"q?"}' } }],
      });

      await aiService.generateScenario(baseParams);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.9);
    });

    it('requests json_object response format', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"scenario":"test","question":"q?"}' } }],
      });

      await aiService.generateScenario(baseParams);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('judgeResponse', () => {
    const baseParams = {
      cardType: 'read',
      word: 'hello',
      concept: '打招呼',
      scenario: { scenario: 'Test scenario' },
      userResponse: 'Hello!',
      history: [],
      failCount: 0,
      aiConfig: { provider: 'qwen', apiKey: 'sk-test', baseURL: '', model: 'qwen-plus' },
      proficiencyConfig: null,
    };

    it('returns ease and feedback', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ease":3,"feedback":"You understood the meaning."}' } }],
      });

      const result = await aiService.judgeResponse(baseParams);
      expect(result.ease).toBe(3);
      expect(result.feedback).toBe('You understood the meaning.');
    });

    it('clamps ease to 1-4 range', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ease":10,"feedback":"Great!"}' } }],
      });

      const result = await aiService.judgeResponse(baseParams);
      expect(result.ease).toBe(4); // clamped to max 4
    });

    it('clamps negative ease to 1', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ease":-5,"feedback":"Needs work."}' } }],
      });

      const result = await aiService.judgeResponse(baseParams);
      expect(result.ease).toBe(1); // clamped to min 1
    });

    it('handles missing feedback field gracefully', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ease":3}' } }],
      });

      const result = await aiService.judgeResponse(baseParams);
      expect(result.feedback).toBe('');
    });

    it('uses temperature 0.5 for consistency', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"ease":3,"feedback":"ok"}' } }],
      });

      await aiService.judgeResponse(baseParams);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.5);
    });
  });
});
