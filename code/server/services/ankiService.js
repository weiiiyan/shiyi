/**
 * Anki-Connect API 服务层
 * Anki-Connect 运行在 localhost:8765，所有请求为 POST JSON
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
 * 获取所有 MaiMemo 项目牌组（MaiMemo:: 前缀的子牌组）
 * 返回牌组名和统计信息
 */
async function getMaiMemoDecks() {
  const allDecks = await invoke('deckNames');
  const maiMemoDecks = allDecks.filter((d) => d.startsWith('MaiMemo::'));

  const deckStats = await invoke('getDecks', { cards: [], decks: maiMemoDecks });

  // 获取每个牌组的到期卡片数
  const dueCounts = {};
  for (const deck of maiMemoDecks) {
    const dueCards = await invoke('findCards', { query: `deck:"${deck}" is:due` });
    dueCounts[deck] = dueCards.length;
  }

  return maiMemoDecks.map((name) => ({
    id: encodeURIComponent(name),
    name: name.replace('MaiMemo::', ''),
    fullName: name,
    totalCards: deckStats[name]?.total_in_deck || 0,
    dueCards: dueCounts[name] || 0,
  }));
}

/**
 * 获取指定牌组中到期的卡片
 * 返回卡片信息（含 note 字段数据）
 */
async function getDueCards(deckFullName) {
  const cardIds = await invoke('findCards', {
    query: `deck:"${deckFullName}" is:due`,
  });

  if (cardIds.length === 0) return [];

  const cardsInfo = await invoke('cardsInfo', { cards: cardIds });
  const noteIds = await invoke('cardsToNotes', { cards: cardIds, unique: true });
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
      concept: note.fields?.Concept?.value || note.fields?.concept?.value || '',
      word: note.fields?.Word?.value || note.fields?.word?.value || '',
      cardType: note.fields?.CardType?.value || note.fields?.card_type?.value || 'read',
      subDeck: note.fields?.SubDeck?.value || note.fields?.sub_deck?.value || '',
      examples: parseJsonField(note.fields?.Examples?.value || note.fields?.examples?.value || '[]'),
      context: note.fields?.Context?.value || note.fields?.context?.value || '',
    };
  });
}

/**
 * 获取牌组中所有已掌握的词汇（用户已知词库）
 * 用于约束 AI 生成场景时的用词范围
 */
async function getKnownVocabulary(deckFullName) {
  const noteIds = await invoke('findNotes', { query: `deck:"${deckFullName}"` });

  if (noteIds.length === 0) return [];

  const notesInfo = await invoke('notesInfo', { notes: noteIds });

  const words = new Set();
  for (const note of notesInfo) {
    const word = note.fields?.Word?.value || note.fields?.word?.value || '';
    const concept = note.fields?.Concept?.value || note.fields?.concept?.value || '';
    if (word) {
      words.add(JSON.stringify({ word: word.trim(), concept: concept.trim() }));
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
  // ease 值映射：1=again(重来), 3=good(良好), 4=easy(简单)
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
  getMaiMemoDecks,
  getDueCards,
  getKnownVocabulary,
  answerCard,
  isAvailable,
};
