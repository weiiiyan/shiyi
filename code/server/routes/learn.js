import { Router } from 'express';
import ankiService from '../services/ankiService.js';
import aiService from '../services/aiService.js';
import sessionService from '../services/sessionService.js';

const router = Router();

/**
 * POST /api/learn/start
 * 开始学习一个牌组。
 * 从 Anki 获取到期卡片，取第一张，生成学习场景。
 */
router.post('/start', async (req, res) => {
  try {
    const { deckId, aiConfig } = req.body;

    if (!deckId) {
      return res.status(400).json({ error: '请选择牌组' });
    }

    const deckFullName = decodeURIComponent(deckId);

    // 获取到期卡片
    const dueCards = await ankiService.getDueCards(deckFullName);

    if (dueCards.length === 0) {
      return res.json({
        done: true,
        message: '🎉 今天这个牌组没有需要学习的卡片了！',
        totalDue: 0,
      });
    }

    // 获取已知词汇
    const knownWords = await ankiService.getKnownVocabulary(deckFullName);

    // 创建会话
    sessionService.createSession(deckId, aiConfig);

    // 取第一张卡片
    const card = dueCards[0];

    // AI 生成场景
    const scenario = await aiService.generateScenario({
      cardType: card.cardType,
      word: card.word,
      concept: card.concept,
      knownWords,
      context: card.context,
      aiConfig,
    });

    // 在会话中设置当前卡片
    sessionService.setCurrentCard(deckId, card, scenario);

    res.json({
      done: false,
      card: {
        cardId: card.cardId,
        word: card.word,
        cardType: card.cardType,
      },
      scenario,
      totalDue: dueCards.length,
      remaining: dueCards.length - 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/learn/respond
 * 用户回复对话，AI 判断掌握程度。
 */
router.post('/respond', async (req, res) => {
  try {
    const { deckId, response: userResponse } = req.body;

    if (!deckId) {
      return res.status(400).json({ error: '缺少牌组 ID' });
    }

    const session = sessionService.getSession(deckId);
    if (!session) {
      return res.status(400).json({ error: '没有活跃的学习会话，请重新开始' });
    }

    if (!session.currentCard) {
      return res.status(400).json({ error: '没有当前卡片' });
    }

    // 记录用户消息
    sessionService.addMessage(deckId, 'user', userResponse);

    // AI 判断
    const judgment = await aiService.judgeResponse({
      cardType: session.currentCard.cardType,
      word: session.currentCard.word,
      concept: session.currentCard.concept,
      scenario: session.scenario,
      userResponse,
      history: session.history,
      failCount: session.failCount,
      aiConfig: session.aiConfig,
    });

    // 记录 AI 反馈
    sessionService.addMessage(deckId, 'assistant', judgment.feedback);

    res.json({
      judgment: {
        ease: judgment.ease,
        feedback: judgment.feedback,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/learn/complete
 * 完成当前卡片，更新 Anki，获取下一张卡片。
 */
router.post('/complete', async (req, res) => {
  try {
    const { deckId, ease } = req.body;

    if (!deckId) {
      return res.status(400).json({ error: '缺少牌组 ID' });
    }

    const session = sessionService.getSession(deckId);
    if (!session || !session.currentCard) {
      // 如果会话丢失，仅记录 ease
      return res.json({ done: true, message: '会话已过期，请重新开始' });
    }

    const cardId = session.currentCard.cardId;

    // 更新 Anki
    await ankiService.answerCard(cardId, ease);

    // 记录到会话
    sessionService.recordScore(deckId, ease);
    sessionService.markCardComplete(deckId, cardId);

    const deckFullName = decodeURIComponent(deckId);
    const progress = sessionService.getProgress(deckId);

    res.json({
      cardCompleted: true,
      progress,
      next: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/learn/next
 * 获取下一张到期卡片并生成场景。
 */
router.post('/next', async (req, res) => {
  try {
    const { deckId } = req.body;

    if (!deckId) {
      return res.status(400).json({ error: '缺少牌组 ID' });
    }

    const session = sessionService.getSession(deckId);
    if (!session) {
      return res.status(400).json({ error: '没有活跃的学习会话' });
    }

    const deckFullName = decodeURIComponent(deckId);

    // 获取到期卡片
    const dueCards = await ankiService.getDueCards(deckFullName);

    // 过滤掉已完成的
    const remaining = dueCards.filter(
      (c) => !session.completedCards.includes(c.cardId)
    );

    if (remaining.length === 0) {
      return res.json({
        done: true,
        message: '🎉 太棒了！今天这个牌组的卡片全部学完了！',
        progress: sessionService.getProgress(deckId),
        totalDue: 0,
      });
    }

    // 获取已知词汇
    const knownWords = await ankiService.getKnownVocabulary(deckFullName);

    // 取下一张卡片
    const card = remaining[0];

    // AI 生成场景
    const scenario = await aiService.generateScenario({
      cardType: card.cardType,
      word: card.word,
      concept: card.concept,
      knownWords,
      context: card.context,
      aiConfig: session.aiConfig,
    });

    sessionService.setCurrentCard(deckId, card, scenario);

    res.json({
      done: false,
      card: {
        cardId: card.cardId,
        word: card.word,
        cardType: card.cardType,
      },
      scenario,
      totalDue: dueCards.length,
      remaining: remaining.length - 1,
      progress: sessionService.getProgress(deckId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/learn/progress
 * 获取当前学习进度
 */
router.get('/progress', async (req, res) => {
  try {
    const { deckId } = req.query;

    if (!deckId) {
      return res.status(400).json({ error: '缺少牌组 ID' });
    }

    const progress = sessionService.getProgress(deckId);
    if (!progress) {
      return res.json({ active: false });
    }

    res.json({ active: true, ...progress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
