import { Router } from 'express';
import ankiService from '../services/ankiService.js';
import aiService from '../services/aiService.js';
import sessionService from '../services/sessionService.js';
import { errorResponse } from '../lib/errorHandler.js';
import { validateDeckId, validateEase, assertValid } from '../lib/validation.js';

const router = Router();

/**
 * 共享的卡片准备 + 场景生成逻辑
 * 供 /start 和 /next 复用，消除重复代码
 *
 * @param {string} deckId - 已编码的牌组 ID
 * @param {Array} cards - 待选卡片列表
 * @param {Object} session - 当前学习会话
 * @param {Object} aiConfig - AI 配置
 * @param {Object} proficiencyConfig - 水平配置
 * @param {number} totalCount - 可选卡片总数（用于进度提示）
 */
async function prepareCardAndScenario(deckId, cards, session, aiConfig, proficiencyConfig, totalCount) {
  const deckFullName = decodeURIComponent(deckId);

  // 获取已知词汇
  const knownWords = await ankiService.getKnownVocabulary(deckFullName);

  // 按类型轮换取下一张卡片
  const card = sessionService.pickNextCard(cards, session);

  if (!card) return null;

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

  return {
    done: false,
    card: {
      cardId: card.cardId,
      word: card.word,
      concept: card.concept,
      cardType: card.cardType,
      ankiType: card.type, // 0=new, 1=learning, 2=review
    },
    scenario,
    totalDue: totalCount,
    remaining: totalCount - 1,
  };
}

/**
 * POST /api/learn/start
 * 开始学习一个牌组。
 * 从 Anki 获取到期卡片，取第一张，生成学习场景。
 */
router.post('/start', async (req, res) => {
  try {
    const { deckId, aiConfig, proficiencyConfig } = req.body;

    assertValid(validateDeckId(deckId));

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

    // 创建会话
    sessionService.createSession(deckId, aiConfig, proficiencyConfig);
    const session = sessionService.getSession(deckId);

    const result = await prepareCardAndScenario(
      deckId, dueCards, session, aiConfig, proficiencyConfig, dueCards.length
    );

    if (!result) {
      return res.json({
        done: true,
        message: '没有可用的学习卡片',
        totalDue: dueCards.length,
      });
    }

    res.json(result);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

/**
 * POST /api/learn/respond
 * 用户回复对话，AI 判断掌握程度。
 */
router.post('/respond', async (req, res) => {
  try {
    const { deckId, response: userResponse } = req.body;

    assertValid(validateDeckId(deckId));

    const session = sessionService.getSession(deckId);
    if (!session) {
      return errorResponse(res, 400, '没有活跃的学习会话，请重新开始');
    }

    if (!session.currentCard) {
      return errorResponse(res, 400, '没有当前卡片');
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
    errorResponse(res, 500, err.message);
  }
});

/**
 * POST /api/learn/complete
 * 完成当前卡片，更新 Anki。
 */
router.post('/complete', async (req, res) => {
  try {
    const { deckId, ease } = req.body;

    assertValid(validateDeckId(deckId));
    const validatedEase = validateEase(ease);
    assertValid(validatedEase);

    const session = sessionService.getSession(deckId);
    if (!session || !session.currentCard) {
      // 如果会话丢失，仅返回提示
      return res.json({ done: true, message: '会话已过期，请重新开始' });
    }

    const cardId = session.currentCard.cardId;

    // 更新 Anki
    await ankiService.answerCard(cardId, validatedEase.value);

    // 记录到会话
    sessionService.recordScore(deckId, ease);
    sessionService.markCardComplete(deckId, cardId);

    const progress = sessionService.getProgress(deckId);

    res.json({
      cardCompleted: true,
      progress,
      next: true,
    });
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

/**
 * POST /api/learn/next
 * 获取下一张到期卡片并生成场景。
 */
router.post('/next', async (req, res) => {
  try {
    const { deckId } = req.body;

    assertValid(validateDeckId(deckId));

    const session = sessionService.getSession(deckId);
    if (!session) {
      return errorResponse(res, 400, '没有活跃的学习会话');
    }

    const deckFullName = decodeURIComponent(deckId);

    // 获取到期卡片
    const dueCards = await ankiService.getDueCards(deckFullName);

    // 过滤掉已完成的卡片
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

    const result = await prepareCardAndScenario(
      deckId, remaining, session, session.aiConfig, session.proficiencyConfig, remaining.length
    );

    if (!result) {
      return res.json({
        done: true,
        message: '没有更多可用的学习卡片',
        progress: sessionService.getProgress(deckId),
        totalDue: remaining.length,
      });
    }

    // /next 额外返回 progress
    result.progress = sessionService.getProgress(deckId);
    res.json(result);
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

/**
 * GET /api/learn/progress
 * 获取当前学习进度
 */
router.get('/progress', async (req, res) => {
  try {
    const { deckId } = req.query;

    assertValid(validateDeckId(deckId));

    const progress = sessionService.getProgress(deckId);
    if (!progress) {
      return res.json({ active: false });
    }

    res.json({ active: true, ...progress });
  } catch (err) {
    errorResponse(res, 500, err.message);
  }
});

export default router;
