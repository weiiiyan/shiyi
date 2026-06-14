/**
 * Anki-Connect API 服务层
 * Anki-Connect 运行在 localhost:8765，所有请求为 POST JSON
 *
 * 牌组查询统一使用 deck:"名称" 格式，Anki 内置递归搜索所有子牌组。
 * 经验证，当前 Anki-Connect 版本对中英文牌组名称均能正确处理。
 */

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';
const ANKI_TIMEOUT_MS = 10000;

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

  // 匹配 "ShiYi::" 子牌组和顶级 "ShiYi" 牌组
  const shiYiDecks = allDecks.filter(
    (d) => d === 'ShiYi' || d.startsWith('ShiYi::')
  );

  // 如果没有 ShiYi 牌组，直接返回空
  if (shiYiDecks.length === 0) {
    return { decks: [], allDecks };
  }

  // 用 deck:"ShiYi" 一次性查出整棵树的所有卡片
  // deck: 自动递归搜索所有子牌组
  let allCardIds = [];
  let dueCardIds = [];
  try {
    allCardIds = await invoke('findCards', { query: 'deck:"ShiYi"' });
  } catch (err) {
    console.error('[ankiService] findCards all failed:', err.message);
  }

  try {
    dueCardIds = await invoke('findCards', {
      query: 'deck:"ShiYi" is:due',
    });
  } catch (err) {
    console.error('[ankiService] findCards due failed:', err.message);
  }

  let newCardIds = [];
  try {
    newCardIds = await invoke('findCards', {
      query: 'deck:"ShiYi" is:new',
    });
  } catch (err) {
    console.error('[ankiService] findCards new failed:', err.message);
  }

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
          if (newSet.has(card.cardId)) {
            stat.newCards++;
          }
          if (dueSet.has(card.cardId)) {
            stat.reviewCards++;
          }
        }
        // 卡片属于 ShiYi 树但不在 shiYiDecks 列表中则忽略
        // （例如用户曾手动移到已删除的 ShiYi 子牌组）
      }
    } catch (err) {
      // cardsInfo 失败时回退：至少填入 totalCards 总数
      console.error('[ankiService] cardsInfo failed:', err.message);
      for (const name of shiYiDecks) {
        deckStats[name].totalCards = allCardIds.length;
        deckStats[name].newCards = newCardIds.length;
        deckStats[name].reviewCards = dueCardIds.length;
      }
    }
  }

  // 聚合子牌组数据到父牌组：父牌组 = 自身 + 所有后代
  const aggregatedStats = {};
  for (const name of shiYiDecks) {
    aggregatedStats[name] = {
      totalCards: deckStats[name].totalCards,
      newCards: deckStats[name].newCards,
      reviewCards: deckStats[name].reviewCards,
    };
    // 累加所有子牌组
    const prefix = name + '::';
    for (const child of shiYiDecks) {
      if (child.startsWith(prefix)) {
        aggregatedStats[name].totalCards += deckStats[child].totalCards;
        aggregatedStats[name].newCards += deckStats[child].newCards;
        aggregatedStats[name].reviewCards += deckStats[child].reviewCards;
      }
    }
  }

  const statsList = shiYiDecks.map((name) => ({
    name,
    displayName: name.replace('ShiYi::', ''),
    totalCards: aggregatedStats[name].totalCards,
    newCards: aggregatedStats[name].newCards,
    reviewCards: aggregatedStats[name].reviewCards,
  }));

  return {
    decks: statsList.map((s) => ({
      id: encodeURIComponent(s.name),
      name: s.displayName,
      fullName: s.name,
      totalCards: s.totalCards,
      newCards: s.newCards,
      reviewCards: s.reviewCards,
      dueCards: s.reviewCards,  // backward compat
    })),
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
 * 关键修复：Anki-Connect 的 cardsInfo 返回的 note ID 字段名是 `note`，不是 `noteId`
 */
async function fetchCardsWithNotes(cardIds) {
  const cardsInfo = await invoke('cardsInfo', { cards: cardIds });

  // 从 cardsInfo 中提取 note ID（Anki-Connect 字段名为 `note`，不是 `noteId`）
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
    // 关键修复：Anki-Connect 的 cardsInfo 返回的 note ID 字段名是 `note`，不是 `noteId`
    const note = noteMap[card.note] || {};

    return {
      cardId: card.cardId,
      // 使用 card.note（Anki-Connect 的 note ID 字段名）
      noteId: card.note,
      deck: card.deckName,
      type: card.type, // 0=new, 1=learning, 2=review
      due: card.due,
      interval: card.interval,
      ease: card.ease,
      // Note fields
      concept:
        note.fields?.Concept?.value || note.fields?.concept?.value || '',
      word: note.fields?.Word?.value || note.fields?.word?.value || '',
      cardType:
        note.fields?.CardType?.value ||
        note.fields?.card_type?.value ||
        randomCardType(card.cardId),
      subDeck:
        note.fields?.SubDeck?.value || note.fields?.sub_deck?.value || '',
      examples: parseJsonField(
        note.fields?.Examples?.value || note.fields?.examples?.value || '[]'
      ),
      context:
        note.fields?.Context?.value || note.fields?.context?.value || '',
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

  const words = new Set();
  for (const note of notesInfo) {
    const word = note.fields?.Word?.value || note.fields?.word?.value || '';
    const concept =
      note.fields?.Concept?.value || note.fields?.concept?.value || '';
    if (word) {
      words.add(
        JSON.stringify({ word: word.trim(), concept: concept.trim() })
      );
    }
  }

  return [...words].map((s) => JSON.parse(s));
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
