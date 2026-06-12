/**
 * Anki-Connect API 服务层
 * Anki-Connect 运行在 localhost:8765，所有请求为 POST JSON
 *
 * 重要：Windows 版 Anki-Connect 存在中文牌组名 UTF-8 编码问题。
 * 所有查询必须使用牌组 ID（did:xxx）而非牌组名称（deck:"xxx"），
 * 否则含中文的牌组名会导致 Anki 内部 Python 进程 UTF-8 解码失败。
 */

const ANKI_CONNECT_URL = process.env.ANKI_CONNECT_URL || 'http://localhost:8765';

async function invoke(action, params = {}) {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Anki-Connect error [${action}]: ${data.error}`);
  }

  return data.result;
}

/**
 * 获取所有 Anki 牌组名称（调试用）
 */
async function getAllDeckNames() {
  return invoke('deckNames');
}

/**
 * 构建牌组名称与 ID 的双向映射
 * 返回 { nameToId: {}, idToName: {} }
 */
async function getDeckMapping() {
  const mapping = await invoke('deckNamesAndIds');
  const nameToId = {};
  const idToName = {};
  for (const [name, id] of Object.entries(mapping)) {
    nameToId[name] = id;
    idToName[id] = name;
  }
  return { nameToId, idToName };
}

/**
 * 获取所有 MaiMemo 项目牌组（MaiMemo:: 前缀的子牌组）
 * 返回牌组名和统计信息
 */
async function getMaiMemoDecks() {
  const allDecks = await invoke('deckNames');

  // 匹配 "MaiMemo::" 子牌组和顶级 "MaiMemo" 牌组
  const maiMemoDecks = allDecks.filter(
    (d) => d === 'MaiMemo' || d.startsWith('MaiMemo::')
  );

  // 如果没有 MaiMemo 牌组，直接返回空
  if (maiMemoDecks.length === 0) {
    return { decks: [], allDecks };
  }

  // 构建牌组 ID 映射（避免在查询中使用中文牌组名）
  const { nameToId } = await getDeckMapping();

  // 使用 did: 查询（牌组 ID）避免中文 UTF-8 编码问题
  const statsList = [];
  for (const name of maiMemoDecks) {
    const deckId = nameToId[name];
    if (!deckId) {
      // 牌组不存在于映射中，跳过
      statsList.push({
        name,
        displayName: name.replace('MaiMemo::', ''),
        totalCards: 0,
        dueCards: 0,
      });
      continue;
    }

    let totalCards = 0;
    let dueCards = 0;

    try {
      // 用 did: 查询所有卡片数
      const allCardIds = await invoke('findCards', { query: `did:${deckId}` });
      totalCards = allCardIds.length;

      // 用到期的卡片数
      const dueCardIds = await invoke('findCards', {
        query: `did:${deckId} is:due`,
      });
      dueCards = dueCardIds.length;
    } catch {
      // 单次查询失败不阻塞其他牌组
    }

    statsList.push({
      name,
      displayName: name.replace('MaiMemo::', ''),
      totalCards,
      dueCards,
    });
  }

  return {
    decks: statsList.map((s) => ({
      id: encodeURIComponent(s.name),
      name: s.displayName,
      fullName: s.name,
      totalCards: s.totalCards,
      dueCards: s.dueCards,
    })),
    allDecks,
  };
}

/**
 * 获取指定牌组中到期的卡片
 * 返回卡片信息（含 note 字段数据）
 *
 * @param {string} deckFullName — 牌组全名（decodeURIComponent 之后），如 "MaiMemo::编程"
 */
async function getDueCards(deckFullName) {
  // 通过牌组名查找 ID，避免中文查询问题
  const { nameToId } = await getDeckMapping();
  const deckId = nameToId[deckFullName];

  if (!deckId) {
    return [];
  }

  // 使用 did: 查询避免中文 UTF-8 错误
  const cardIds = await invoke('findCards', {
    query: `did:${deckId} is:due`,
  });

  if (cardIds.length === 0) return [];

  const cardsInfo = await invoke('cardsInfo', { cards: cardIds });
  const noteIds = await invoke('cardsToNotes', { cards: cardIds });
  const notesInfo = await invoke('notesInfo', { notes: noteIds });

  // 构建 noteId → note 的映射
  const noteMap = {};
  for (const note of notesInfo) {
    noteMap[note.noteId] = note;
  }

  // 合并卡片信息和 note 字段
  return cardsInfo.map((card) => {
    const note = noteMap[card.noteId] || {};
    return {
      cardId: card.cardId,
      noteId: card.noteId,
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
        'read',
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
  // 通过牌组名查找 ID，使用 did: 查询避免中文 UTF-8 错误
  const { nameToId } = await getDeckMapping();
  const deckId = nameToId[deckFullName];

  if (!deckId) {
    return [];
  }

  const noteIds = await invoke('findNotes', { query: `did:${deckId}` });

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

export default {
  getAllDeckNames,
  getMaiMemoDecks,
  getDueCards,
  getKnownVocabulary,
  answerCard,
  isAvailable,
};
