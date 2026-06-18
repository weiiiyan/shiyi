/**
 * 学习会话管理服务
 *
 * 每个会话对应一个用户在一个牌组中的学习过程。
 * 跟踪当前卡片、对话历史、连续失败次数等状态。
 */

import { CARD_TYPES } from './ankiService.js';

const sessions = new Map();

// 会话过期时间：2 小时
const SESSION_TTL = 2 * 60 * 60 * 1000;

/**
 * 创建或重置学习会话
 */
function createSession(deckId, aiConfig, proficiencyConfig) {
  // 清理旧会话
  const oldSession = sessions.get(deckId);
  if (oldSession) {
    clearTimeout(oldSession.timer);
  }

  const session = {
    deckId,
    aiConfig,
    proficiencyConfig,
    currentCard: null,
    history: [], // [{role, content}]
    scenario: null, // 当前 AI 生成的学习场景
    failCount: 0,
    lastCardType: null,   // 卡片类型轮换指针
    scenarioHistory: {},   // word -> [scenarioHash, ...] 场景去重
    completedCards: [], // 已完成的卡片 ID
    scores: { again: 0, good: 0, easy: 0 },
    startedAt: Date.now(),
    timer: null,
  };

  session.timer = setTimeout(() => {
    sessions.delete(deckId);
  }, SESSION_TTL);

  sessions.set(deckId, session);
  return session;
}

function getSession(deckId) {
  const session = sessions.get(deckId);
  if (session) {
    // 刷新过期时间
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      sessions.delete(deckId);
    }, SESSION_TTL);
  }
  return session;
}

function deleteSession(deckId) {
  const session = sessions.get(deckId);
  if (session) {
    clearTimeout(session.timer);
    sessions.delete(deckId);
  }
}

function setCurrentCard(deckId, card, scenario) {
  const session = getSession(deckId);
  if (!session) return false;

  session.currentCard = card;
  session.scenario = scenario;
  session.history = [];
  session.failCount = 0;

  // 将 AI 生成的场景作为第一条消息
  session.history.push({
    role: 'assistant',
    content: formatScenarioMessage(card.cardType, scenario),
  });

  return true;
}

function addMessage(deckId, role, content) {
  const session = getSession(deckId);
  if (!session) return;

  session.history.push({ role, content });
}

function recordScore(deckId, ease) {
  const session = getSession(deckId);
  if (!session) return;

  if (ease === 1) {
    session.scores.again++;
    session.failCount++;
  } else if (ease === 3 || ease === 4) {
    session.scores[ease === 3 ? 'good' : 'easy']++;
    session.failCount = 0;
  }
}

function markCardComplete(deckId, cardId) {
  const session = getSession(deckId);
  if (!session) return;

  session.completedCards.push(cardId);
}

function getProgress(deckId) {
  const session = getSession(deckId);
  if (!session) return null;

  return {
    completed: session.completedCards.length,
    scores: { ...session.scores },
    failCount: session.failCount,
    startedAt: session.startedAt,
  };
}

/**
 * 记录某个单词已生成的场景（用于去重——避免同一单词再次出现时生成雷同场景）
 */
function recordScenario(deckId, wordKey, scenario) {
  const session = getSession(deckId);
  if (!session) return;
  if (!session.scenarioHistory[wordKey]) {
    session.scenarioHistory[wordKey] = [];
  }
  // 简单哈希：场景 JSON 前 50 字符 + 长度
  const json = JSON.stringify(scenario);
  const hash = json.slice(0, 50) + '_' + json.length;
  if (!session.scenarioHistory[wordKey].includes(hash)) {
    session.scenarioHistory[wordKey].push(hash);
  }
}

/**
 * 获取某个单词的历史场景（供 AI 生成新场景时参考去重）
 */
function getPreviousScenarios(deckId, wordKey) {
  const session = getSession(deckId);
  if (!session || !session.scenarioHistory[wordKey]) return [];
  return session.scenarioHistory[wordKey];
}

function formatScenarioMessage(cardType, scenario) {
  switch (cardType) {
    case 'read':
      return `${scenario?.scenario || ''}\n\n${scenario?.question || ''}${scenario?.hint ? '\n\n💡 Hint: ' + scenario.hint : ''}`;
    case 'write':
      return `🖊️ ${scenario?.scenario || ''}\n\n${scenario?.task || ''}${scenario?.hint ? '\n\n💡 Hint: ' + scenario.hint : ''}`;
    case 'listen':
      return `🎧 Listen to this:\n\n"${scenario?.audioText || ''}"\n\n${scenario?.question || ''}${scenario?.hint ? '\n\n💡 Hint: ' + scenario.hint : ''}`;
    case 'speak':
      return `🗣️ ${scenario?.scenario || ''}\n\n${scenario?.task || ''}`;
    default:
      return `${scenario?.scenario || scenario?.question || ''}`;
  }
}

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
 * @returns {Object|null} 选中的卡片，或 null（无可用卡片时）
 */
function pickNextCard(cards, session) {
  if (!cards || cards.length === 0) return null;

  // 按类型分组
  const byType = {};
  for (const type of CARD_TYPES) {
    byType[type] = [];
  }
  for (const card of cards) {
    const type = card.cardType || 'read';
    // 未知类型归入 read
    (byType[type] || byType.read).push(card);
  }

  // 从上次类型的下一个开始轮换
  const lastIdx = session.lastCardType != null ? CARD_TYPES.indexOf(session.lastCardType) : -1;
  const startIdx = (lastIdx + 1) % CARD_TYPES.length;

  // 按轮换顺序尝试每种类型
  for (let i = 0; i < CARD_TYPES.length; i++) {
    const type = CARD_TYPES[(startIdx + i) % CARD_TYPES.length];
    const pool = byType[type];
    if (pool.length > 0) {
      session.lastCardType = type;
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  return null;
}

export default {
  createSession,
  getSession,
  deleteSession,
  setCurrentCard,
  addMessage,
  recordScore,
  markCardComplete,
  recordScenario,
  getPreviousScenarios,
  getProgress,
  pickNextCard,
};
