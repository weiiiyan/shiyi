import { Router } from 'express';
import ankiService from '../services/ankiService.js';

const router = Router();

/**
 * GET /api/decks
 * 获取所有 MaiMemo 牌组列表，以及 Anki 中所有牌组名称（供调试）
 */
router.get('/', async (req, res) => {
  try {
    const result = await ankiService.getMaiMemoDecks();
    res.json({
      decks: result.decks || [],
      allDeckNames: result.allDecks || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/decks/status
 * 检查 Anki-Connect 连接状态
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
 * 调试端点 — 返回 Anki 中所有牌组名称（不做 MaiMemo 过滤）
 */
router.get('/all', async (req, res) => {
  try {
    const allDecks = await ankiService.getAllDeckNames();
    res.json({ allDecks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
