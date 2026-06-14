import { Router } from 'express';
import aiService from '../services/aiService.js';
import { validateAiConfig } from '../lib/validation.js';

const router = Router();

/**
 * POST /api/ai/test
 * 测试 AI 连接
 * 注意：前端依赖 { ok, message } 响应形状 (SettingsView.vue)，不可改为标准 error 格式
 */
router.post('/test', async (req, res) => {
  try {
    const { provider, apiKey, baseURL, model } = req.body;

    const validation = validateAiConfig({ apiKey });
    if (!validation.valid) {
      return res.status(400).json({ ok: false, message: validation.error });
    }

    const result = await aiService.testConnection(provider, apiKey, baseURL, model);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
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
