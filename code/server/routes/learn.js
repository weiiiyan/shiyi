import { Router } from 'express';
import ankiService from '../services/ankiService.js';
import aiService from '../services/aiService.js';
import sessionService from '../services/sessionService.js';

const router = Router();

/**
 * 从待学卡片中按类型轮换选择下一张卡片
 *
 * 策略：
 * 1. 按 cardType 分组
 * 2. 从上次使用的类型开始轮换 (read → write → listen → speak)
 * 3. 在选中的类型组内随机抽取一张
 * 4. 如果该类型无卡片，顺延到下一个类型
 *
 * @param {Array} cards - 待选卡片数组
 * @param {Object} session - 当前学习会话 (会修改 session.lastCardType)
 * @returns {Object|null} 选中的卡片
 */
function pickNextCard(cards, session) {
  if (!cards || cards.length === 0) return null;

  // 按类型分组
  const byType = { read: [], write: [], listen: [], speak: [] };
  for (const card of cards) {
    const type = card.cardType || 'read';
    if (byType[type]) {
      byType[type].push(card);
    } else {
      byType.read.push(card); // 未知类型归入 read
    }
  }

  const typeOrder = ['read', 'write', 'listen', 'speak'];

  // 从上次类型的下一个开始轮换
  let startIdx = 0;
  if (session.lastCardType != null) {
    const lastIdx = typeOrder.indexOf(session.lastCardType);
    startIdx = (lastIdx + 1) % typeOrder.length;
  }

  // 按轮换顺序尝试每种类型
  for (let i = 0; i < typeOrder.length; i++) {
    const idx = (startIdx + i) % typeOrder.length;
    const type = typeOrder[idx];
    const pool = byType[type];
    if (pool.length > 0) {
      // 同类型内随机抽取
      const j = Math.floor(Math.random() * pool.length);
      session.lastCardType = type;
      return pool[j];
    }
  }

  return null;
}

/**
 * POST /api/learn/start
 * 开始学习一个牌组。
 * 从 Anki 获取到期卡片，取第一张，生成学习场景。
 */
router.post('/start', async (req, res) => {
  try {
    const { deckId, aiConfig, proficiencyConfig } = req.body;

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
    sessionService.createSession(deckId, aiConfig, proficiencyConfig);
    const session = sessionService.getSession(deckId);

    // 按类型轮换取下一张卡片
    const card = pickNextCard(dueCards, session);

    // 获取该单词的历史场景（用于 AI 去重）
    const previousScenarios = sessionService.getPreviousScenarios(deckId, card.word);

    // AI 生成场景
    const scenario = await aiService.generateScenario({
      cardType: card.cardType,
      word: card.word,
      concept: card.concept,
      knownWords,
      context: card.context,
      aiConfig,
      previousScenarios,
      proficiencyConfig,
    });

    // 记录已生成的场景
    sessionService.recordScenario(deckId, card.word, scenario);

    // 在会话中设置当前卡片
    sessionService.setCurrentCard(deckId, card, scenario);

    res.json({
      done: false,
      card: {
        cardId: card.cardId,
        word: card.word,
        concept: card.concept,
        cardType: card.cardType,
        ankiType: card.type,  // 0=new, 1=learning, 2=review
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
      proficiencyConfig: session.proficiencyConfig,
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

    // 过滤掉已完成的卡片（completedCards 已通过卡片 ID 防止重复练习）
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

    // 按类型轮换取下一张卡片
    const card = pickNextCard(remaining, session);

    // 获取该单词的历史场景（用于 AI 去重）
    const previousScenarios = sessionService.getPreviousScenarios(deckId, card.word);

    // AI 生成场景
    const scenario = await aiService.generateScenario({
      cardType: card.cardType,
      word: card.word,
      concept: card.concept,
      knownWords,
      context: card.context,
      aiConfig: session.aiConfig,
      previousScenarios,
      proficiencyConfig: session.proficiencyConfig,
    });

    // 记录已生成的场景
    sessionService.recordScenario(deckId, card.word, scenario);

    sessionService.setCurrentCard(deckId, card, scenario);

    res.json({
      done: false,
      card: {
        cardId: card.cardId,
        word: card.word,
        concept: card.concept,
        cardType: card.cardType,
        ankiType: card.type,  // 0=new, 1=learning, 2=review
      },
      scenario,
      totalDue: remaining.length,
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
