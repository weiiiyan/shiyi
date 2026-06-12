import { Router } from 'express';
import aiService from '../services/aiService.js';

const router = Router();

/**
 * POST /api/ai/test
 * 测试 AI 连接
 */
router.post('/test', async (req, res) => {
  try {
    const { provider, apiKey, baseURL, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({ ok: false, message: '请填写 API Key' });
    }

    const result = await aiService.testConnection(provider, apiKey, baseURL, model);
    res.json(result);
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

/**
 * GET /api/ai/presets
 * 获取预设模型配置
 */
router.get('/presets', async (req, res) => {
  res.json({ presets: aiService.MODEL_PRESETS });
});

export default router;
