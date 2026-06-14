import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/aiService.js', () => ({
  default: {
    MODEL_PRESETS: {
      qwen: { name: '千问', baseURL: 'https://test.com', models: ['qwen-plus'], defaultModel: 'qwen-plus' },
    },
    testConnection: vi.fn(),
  },
}));

import app from '../index.js';
import aiService from '../services/aiService.js';

describe('AI Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/ai/test', () => {
    it('returns 400 when apiKey is missing', async () => {
      const res = await request(app)
        .post('/api/ai/test')
        .send({ provider: 'qwen' });

      expect(res.status).toBe(400);
      // Frontend checks data.ok (SettingsView.vue:286)
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toBeTruthy();
    });

    it('returns ok true on successful test', async () => {
      aiService.testConnection.mockResolvedValueOnce({
        ok: true,
        message: 'OK',
      });

      const res = await request(app)
        .post('/api/ai/test')
        .send({ provider: 'qwen', apiKey: 'sk-test', model: 'qwen-plus' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toBe('OK');
    });

    it('returns ok false on connection failure', async () => {
      aiService.testConnection.mockResolvedValueOnce({
        ok: false,
        message: 'Connection refused',
      });

      const res = await request(app)
        .post('/api/ai/test')
        .send({ provider: 'qwen', apiKey: 'sk-test' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toBe('Connection refused');
    });

    it('returns ok false on unexpected error', async () => {
      aiService.testConnection.mockRejectedValueOnce(new Error('Unexpected failure'));

      const res = await request(app)
        .post('/api/ai/test')
        .send({ provider: 'qwen', apiKey: 'sk-test' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toBe('Unexpected failure');
    });
  });

  describe('GET /api/ai/presets', () => {
    it('returns model presets', async () => {
      const res = await request(app).get('/api/ai/presets');

      expect(res.status).toBe(200);
      expect(res.body.presets).toBeDefined();
      expect(res.body.presets.qwen).toBeDefined();
    });
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.time).toBeTruthy();
    });
  });
});
