import { Router } from 'express';
import ankiService from '../services/ankiService.js';
import { errorResponse } from '../lib/errorHandler.js';

const router = Router();

/**
 * GET /api/decks
 * 获取所有 ShiYi 牌组列表，以及 Anki 中所有牌组名称（供调试）
 */
router.get('/', async (req, res) => {
  try {
    const result = await ankiService.getShiYiDecks();
    res.json({
      decks: result.decks || [],
      allDeckNames: result.allDecks || [],
    });
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

/**
 * GET /api/decks/status
 * 检查 Anki-Connect 连接状态
 * 注意：前端依赖 { available, version?, error? } 响应形状，不可改为标准 error 格式
 */
router.get('/status', async (req, res) => {
  try {
    const status = await ankiService.isAvailable();
    res.json(status);
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

/**
 * GET /api/decks/all
 * 调试端点 — 返回 Anki 中所有牌组名称（不做 ShiYi 过滤）
 */
router.get('/all', async (req, res) => {
  try {
    const allDecks = await ankiService.getAllDeckNames();
    res.json({ allDecks });
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

export default router;
