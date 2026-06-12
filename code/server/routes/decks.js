import { Router } from 'express';
import ankiService from '../services/ankiService.js';

const router = Router();

/**
 * GET /api/decks
 * 获取所有 MaiMemo 牌组列表
 */
router.get('/', async (req, res) => {
  try {
    const decks = await ankiService.getMaiMemoDecks();
    res.json({ decks });
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

export default router;
