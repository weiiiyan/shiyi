/**
 * Anki-Connect API 服务层
 * Anki-Connect 运行在 localhost:8765，所有请求为 POST JSON
 *
 * 牌组查询统一使用 deck:"名称" 格式，Anki 内置递归搜索所有子牌组。
 * 经验证，当前 Anki-Connect 版本对中英文牌组名称均能正确处理。
 */

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';
const ANKI_TIMEOUT_MS = parseInt(process.env.ANKI_TIMEOUT_MS, 10) || 10000;

const DECK_PREFIX = 'ShiYi';
const DECK_CHILD_PREFIX = DECK_PREFIX + '::';
const isShiYiDeck = (d) => d === DECK_PREFIX || d.startsWith(DECK_CHILD_PREFIX);

async function invoke(action, params = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANKI_TIMEOUT_MS);

  try {
    const response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal,
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Anki-Connect error [${action}]: ${data.error}`);
    }

    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取所有 Anki 牌组名称（调试用）
 */
async function getAllDeckNames() {
  return invoke('deckNames');
}

/**
 * 获取所有 ShiYi 项目牌组（ShiYi:: 前缀的子牌组）
 * 返回牌组名和统计信息
 */
async function getShiYiDecks() {
  const allDecks = await invoke('deckNames');

  const shiYiDecks = allDecks.filter(isShiYiDeck);

  if (shiYiDecks.length === 0) {
    return { decks: [], allDecks };
  }

  // 并行查询三种卡片（all / due / new），统一错误处理
  const baseQuery = `deck:"${DECK_PREFIX}"`;
  const queries = [
    { key: 'all', query: baseQuery },
    { key: 'due', query: `${baseQuery} is:due` },
    { key: 'new', query: `${baseQuery} is:new` },
  ];

  const results = await Promise.all(
    queries.map(({ key, query }) =>
      invoke('findCards', { query }).catch((err) => {
        console.error(`[ankiService] findCards ${key} failed:`, err.message);
        return [];
      })
    )
  );
  const [allCardIds, dueCardIds, newCardIds] = results;

  // 构建 due/new 集合用于 O(1) 查找
  const dueSet = new Set(dueCardIds);
  const newSet = new Set(newCardIds);

  // 初始化各牌组统计（先全部归零）
  const deckStats = {};
  for (const name of shiYiDecks) {
    deckStats[name] = { totalCards: 0, newCards: 0, reviewCards: 0 };
  }

  // 批量获取卡片信息，按 deckName 分组统计
  if (allCardIds.length > 0) {
    try {
      const cardsInfo = await invoke('cardsInfo', { cards: allCardIds });
      for (const card of cardsInfo) {
        const stat = deckStats[card.deckName];
        if (stat) {
          stat.totalCards++;
          if (newSet.has(card.cardId)) stat.newCards++;
          if (dueSet.has(card.cardId)) stat.reviewCards++;
        }
      }
    } catch (err) {
      // cardsInfo 失败时无法按牌组拆分，各牌组保持零值
      console.error('[ankiService] cardsInfo failed:', err.message);
    }
  }

  // 聚合子牌组数据到父牌组：父牌组 = 自身 + 所有后代
  // 按深度降序排列，确保子牌组先被处理
  const sortedDecks = [...shiYiDecks].sort(
    (a, b) => b.split('::').length - a.split('::').length
  );
  // 子牌组 → 直接父牌组的映射
  const childToParent = new Map();
  for (const deck of sortedDecks) {
    const lastSep = deck.lastIndexOf('::');
    if (lastSep !== -1) {
      const parent = deck.slice(0, lastSep);
      if (deckStats[parent]) {
        childToParent.set(deck, parent);
      }
    }
  }
  // 从最深子牌组向上累加（每个子牌组只加给直接父牌组，父牌组递归获得全部后代）
  const aggregatedStats = {};
  for (const name of shiYiDecks) {
    aggregatedStats[name] = { ...deckStats[name] };
  }
  for (const name of sortedDecks) {
    const parent = childToParent.get(name);
    if (parent) {
      for (const key of ['totalCards', 'newCards', 'reviewCards']) {
        aggregatedStats[parent][key] += aggregatedStats[name][key];
      }
    }
  }

  // 直接映射为最终结构（合并原来的两步映射）
  return {
    decks: shiYiDecks.map((name) => {
      const stats = aggregatedStats[name];
      return {
        id: encodeURIComponent(name),
        name: name.replace(DECK_CHILD_PREFIX, ''),
        fullName: name,
        totalCards: stats.totalCards,
        newCards: stats.newCards,
        reviewCards: stats.reviewCards,
        dueCards: stats.reviewCards,  // backward compat
      };
    }),
    allDecks,
  };
}

/**
 * 获取指定牌组中到期的卡片
 * 返回卡片信息（含 note 字段数据）
 *
 * @param {string} deckFullName — 牌组全名（decodeURIComponent 之后），如 "ShiYi::编程"
 */
async function getDueCards(deckFullName) {
  // 使用 deck: 查询，Anki 自动递归搜索所有子牌组
  const cardIds = await invoke('findCards', {
    query: `deck:"${deckFullName}" (is:due OR is:new)`,
  });

  if (cardIds.length === 0) return [];

  return fetchCardsWithNotes(cardIds);
}

/**
 * 获取指定牌组中所有卡片（不限到期状态）
 * 用于诊断统计等场景
 */
async function getAllCardsInDeck(deckFullName) {
  const cardIds = await invoke('findCards', {
    query: `deck:"${deckFullName}"`,
  });

  if (cardIds.length === 0) return [];

  return fetchCardsWithNotes(cardIds);
}

/**
 * 根据卡片 ID 批量获取卡片信息并合并 note 字段数据
 * 共享函数，getDueCards 和 getAllCardsInDeck 均使用此函数
 *
 * 注意：Anki-Connect 的 cardsInfo 返回的 note ID 字段名是 `note`，不是 `noteId`
 */
async function fetchCardsWithNotes(cardIds) {
  const cardsInfo = await invoke('cardsInfo', { cards: cardIds });

  const noteIds = [...new Set(cardsInfo.map((c) => c.note).filter(Boolean))];
  const notesInfo = noteIds.length > 0
    ? await invoke('notesInfo', { notes: noteIds })
    : [];

  // 构建 noteId → note 的映射
  const noteMap = {};
  for (const note of notesInfo) {
    noteMap[note.noteId] = note;
  }

  // 合并卡片信息和 note 字段
  return cardsInfo.map((card) => {
    const note = noteMap[card.note] || {};

    return {
      cardId: card.cardId,
      noteId: card.note,
      deck: card.deckName,
      type: card.type, // 0=new, 1=learning, 2=review
      due: card.due,
      interval: card.interval,
      ease: card.ease,
      concept: getNoteField(note, 'Concept', 'concept'),
      word: getNoteField(note, 'Word', 'word'),
      cardType: getNoteField(note, 'CardType', 'card_type', '') || randomCardType(card.cardId),
      subDeck: getNoteField(note, 'SubDeck', 'sub_deck'),
      examples: parseJsonField(getNoteField(note, 'Examples', 'examples', '[]')),
      context: getNoteField(note, 'Context', 'context'),
    };
  });
}

/**
 * 获取牌组中所有已掌握的词汇（用户已知词库）
 * 用于约束 AI 生成场景时的用词范围
 */
async function getKnownVocabulary(deckFullName) {
  // 使用 deck: 查询，Anki 自动递归搜索所有子牌组
  const noteIds = await invoke('findNotes', {
    query: `deck:"${deckFullName}"`,
  });

  if (noteIds.length === 0) return [];

  const notesInfo = await invoke('notesInfo', { notes: noteIds });

  // 用 Map 按 word 去重，避免 JSON stringify/parse 往返
  const wordMap = new Map();
  for (const note of notesInfo) {
    const word = getNoteField(note, 'Word', 'word').trim();
    const concept = getNoteField(note, 'Concept', 'concept').trim();
    if (word && !wordMap.has(word)) {
      wordMap.set(word, { word, concept });
    }
  }

  return [...wordMap.values()];
}

/**
 * 更新卡片学习结果
 * @param {number} cardId - Anki 卡片 ID
 * @param {number} ease - 1=again, 2=hard, 3=good, 4=easy
 */
async function answerCard(cardId, ease) {
  const validEase = Math.max(1, Math.min(4, Math.round(ease)));
  return invoke('answerCards', {
    answers: [{ cardId, ease: validEase }],
  });
}

/**
 * 检查 Anki-Connect 是否可用
 */
async function isAvailable() {
  try {
    const result = await invoke('version');
    return { available: true, version: result };
  } catch {
    return { available: false, version: null };
  }
}

function parseJsonField(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * 从 Anki note 中提取字段值，同时兼容 PascalCase 和 snake_case 命名
 * Anki note 字段命名因用户创建方式不同可能是 Concept 或 concept
 */
function getNoteField(note, pascalKey, snakeKey, fallback = '') {
  return note.fields?.[pascalKey]?.value || note.fields?.[snakeKey]?.value || fallback;
}

/**
 * 当 Anki note 未设置 CardType 时，随机分配一种卡片类型
 * 等概率随机四种类型，使学习体验不再单调
 */
const CARD_TYPES = ['read', 'write', 'listen', 'speak'];

/**
 * 基于卡片 ID 确定性分配卡片类型
 * 使用乘法哈希确保同一张卡片在不同请求中获得一致的类型，
 * 避免破坏 pickNextCard 的轮换机制
 */
function randomCardType(cardId) {
  console.warn(`[ankiService] Card ${cardId} missing CardType field, using deterministic fallback`);
  // 乘法哈希常量 floor(2^32 / φ)，其中 φ ≈ 1.618 (黄金比例)
  // 该常数在乘法哈希中提供良好的位分散特性，确保不同 cardId 产生均匀分布的类型
  const GOLDEN_RATIO_HASH = 2654435761;
  const idx = ((cardId * GOLDEN_RATIO_HASH) >>> 0) % CARD_TYPES.length;
  return CARD_TYPES[idx];
}

export default {
  getAllDeckNames,
  getShiYiDecks,
  getDueCards,
  getAllCardsInDeck,
  getKnownVocabulary,
  answerCard,
  isAvailable,
};
