/**
 * 英语水平配置服务
 *
 * 管理预设水平等级及其对应的 AI 提示词。
 * 每个等级针对读、写、听、说四个维度有独立的提示词，
 * 分别注入到场景生成和作答评判的 system prompt 中。
 */

// 预设水平等级
const DEFAULT_LEVELS = [
  {
    id: 'beginner',
    label: 'Beginner 初学',
    prompts: {
      read: 'The student is a BEGINNER reader (CEFR A1). Their English vocabulary is limited to the most basic 300-500 words. Use ONLY very simple, short words (1-2 syllables). Write sentences with 3-5 words each. Avoid all idioms, phrasal verbs, and complex grammar. The scenario topic should be concrete and visual (colors, numbers, family, food, daily objects).',
      write: 'The student is a BEGINNER writer (CEFR A1). They can only produce very short phrases and simple sentences. The writing task should require just 2-4 words as a response. Use ONLY the most basic vocabulary (top 300 words). Accept spelling errors and grammatical mistakes — focus on whether they conveyed the basic idea.',
      listen: 'The student is a BEGINNER listener (CEFR A1). Speak VERY slowly and clearly in the audioText. Use only basic vocabulary (top 300 words). The audioText should be ONE very short sentence (4-6 words). The comprehension question should be answerable with yes/no or a single word. Avoid any background noise or complex context.',
      speak: 'The student is a BEGINNER speaker (CEFR A1). They can produce single words and formulaic phrases. The speaking task should require just 1-3 words as a spoken response. Accept heavy accent and pronunciation errors — focus on whether they tried to communicate. Model the expected response in the scenario so they can imitate it.',
    },
  },
  {
    id: 'elementary',
    label: 'Elementary 基础',
    prompts: {
      read: 'The student is an ELEMENTARY reader (CEFR A2). Their vocabulary covers about 1000-1500 common words. Use simple sentences with basic connectors (and, but, because). Keep paragraphs to 2-3 short sentences. The topic can involve simple everyday situations (shopping, weather, hobbies, daily routines). Avoid abstract concepts.',
      write: 'The student is an ELEMENTARY writer (CEFR A2). They can write short, simple sentences about familiar topics. The writing task should require a short phrase or single sentence (5-10 words). Use common everyday vocabulary. Accept grammar errors as long as the meaning is understandable.',
      listen: 'The student is an ELEMENTARY listener (CEFR A2). Speak clearly at a slower-than-normal pace. The audioText should be 1-2 short sentences using common vocabulary. Topics should be concrete and familiar (daily routines, personal information, shopping). The comprehension question should be straightforward.',
      speak: 'The student is an ELEMENTARY speaker (CEFR A2). They can produce short phrases and simple sentences about familiar topics. The speaking task should require a short spoken response (a phrase or simple sentence). Accept pronunciation errors and hesitation — encourage communication over accuracy.',
    },
  },
  {
    id: 'intermediate',
    label: 'Intermediate 中级',
    prompts: {
      read: 'The student is an INTERMEDIATE reader (CEFR B1). Their vocabulary covers about 2000-3000 words. Use natural conversational English with moderate sentence complexity. You may use some phrasal verbs and common idioms (explain through context). Topics can include work, travel, opinions, and current events. Occasional unfamiliar words are fine if context makes them clear.',
      write: 'The student is an INTERMEDIATE writer (CEFR B1). They can write connected text on familiar topics. The writing task should require 1-2 complete sentences expressing a thought or opinion. Use everyday vocabulary with occasional slightly advanced words. Expect mostly correct basic grammar — some errors in complex structures are normal.',
      listen: 'The student is an INTERMEDIATE listener (CEFR B1). Speak at a natural conversational pace. The audioText can be 2-3 sentences with moderate complexity. Include some connected speech (linking, weak forms). Topics can include opinions, plans, experiences, and simple narratives.',
      speak: 'The student is an INTERMEDIATE speaker (CEFR B1). They can handle most everyday speaking situations with reasonable fluency. The speaking task should require 1-2 complete spoken sentences. Expect some pauses and self-correction. Focus on whether the message was communicated, not on accent.',
    },
  },
  {
    id: 'upper-intermediate',
    label: 'Upper Intermediate 中高级',
    prompts: {
      read: 'The student is an UPPER-INTERMEDIATE reader (CEFR B2). Their vocabulary covers 4000+ words including some less common terms. Use natural, varied English with complex sentence structures. You may use idioms, phrasal verbs, and nuanced expressions freely. Topics can be abstract or specialized (technology, culture, science, society). Expect them to infer meaning from context.',
      write: 'The student is an UPPER-INTERMEDIATE writer (CEFR B2). They can write clear, detailed text on a wide range of topics. The writing task should require 2-3 well-formed sentences expressing nuanced ideas. Use varied vocabulary including some less common words. Expect mostly correct grammar and appropriate register.',
      listen: 'The student is an UPPER-INTERMEDIATE listener (CEFR B2). Speak at a natural, sometimes fast pace. The audioText can be 3-4 sentences with varied structures and vocabulary. Use connected speech naturally. Topics can include abstract ideas, detailed explanations, and subtle opinions.',
      speak: 'The student is an UPPER-INTERMEDIATE speaker (CEFR B2). They can speak fluently and spontaneously on most topics. The speaking task should require 2-3 natural spoken sentences. Expect relatively fluent delivery with occasional hesitation on complex structures. Push for natural expression.',
    },
  },
  {
    id: 'advanced',
    label: 'Advanced 高级',
    prompts: {
      read: 'The student is an ADVANCED reader (CEFR C1/C2). Their vocabulary is broad and includes specialized and academic terms. Use fully natural English — the same level you would use with a native speaker. Include cultural references, wordplay, nuanced arguments, and sophisticated rhetorical devices. Challenge them with abstract, technical, or literary content.',
      write: 'The student is an ADVANCED writer (CEFR C1/C2). They can write with near-native precision, style, and nuance. The writing task should require sophisticated expression — nuanced opinions, formal register, or creative writing. Use advanced vocabulary and expect appropriate collocations and register. Push for stylistic refinement.',
      listen: 'The student is an ADVANCED listener (CEFR C1/C2). Speak at a fully natural native speed. The audioText can be longer and cover any topic including specialized, abstract, or fast-paced discussions. Use natural features: contractions, reductions, assimilation, different accents/registers. No simplification needed.',
      speak: 'The student is an ADVANCED speaker (CEFR C1/C2). They can express themselves fluently and precisely on any topic. The speaking task should require extended, well-structured spoken responses. Push for precision, appropriate register, and natural expression. Challenge nuanced pronunciation (stress, intonation, rhythm).',
    },
  },
];

// 内置等级 ID 集合，用于判断某个等级是否为预设等级
const BUILTIN_IDS = new Set(DEFAULT_LEVELS.map((l) => l.id));

/**
 * 获取默认水平等级列表（深拷贝，防止调用方意外修改）
 */
function getDefaultLevels() {
  return structuredClone(DEFAULT_LEVELS);
}

/**
 * 判断指定等级 ID 是否为内置预设等级
 */
function isBuiltinLevel(id) {
  return BUILTIN_IDS.has(id);
}

/**
 * 从水平配置中提取指定技能类型的提示词
 *
 * @param {Object} proficiencyConfig - 水平配置 { levels, selected }
 * @param {string} skillType - read | write | listen | speak
 * @returns {string} 对应的提示词，或空字符串
 */
function getProficiencyPrompt(proficiencyConfig, skillType) {
  return proficiencyConfig?.levels?.find((l) => l.id === proficiencyConfig.selected?.[skillType])
    ?.prompts?.[skillType] ?? '';
}

// 各模式下的水平指令后缀
const PROFICIENCY_SUFFIX = {
  scenario: 'Adjust vocabulary, sentence complexity, and scenario content to match this level.',
  judge: "Judge the student's response relative to this level. If they perform at or above this level, score favorably.",
};

/**
 * 构建水平相关提示词块（内部共享）
 *
 * @param {Object} proficiencyConfig
 * @param {string} cardType - read | write | listen | speak
 * @param {string} mode - 'scenario' | 'judge'
 * @returns {string} 插入 system prompt 的文本
 */
function buildProficiencyBlock(proficiencyConfig, cardType, mode) {
  const prompt = getProficiencyPrompt(proficiencyConfig, cardType);
  if (!prompt) return '';
  return `\n\nSTUDENT PROFICIENCY LEVEL (for ${cardType}):\n${prompt}\n${PROFICIENCY_SUFFIX[mode]}`;
}

/**
 * 为场景生成构建水平相关提示词
 */
function buildScenarioProficiency(proficiencyConfig, cardType) {
  return buildProficiencyBlock(proficiencyConfig, cardType, 'scenario');
}

/**
 * 为作答评判构建水平相关提示词
 */
function buildJudgeProficiency(proficiencyConfig, cardType) {
  return buildProficiencyBlock(proficiencyConfig, cardType, 'judge');
}

export default {
  getDefaultLevels,
  isBuiltinLevel,
  getProficiencyPrompt,
  buildScenarioProficiency,
  buildJudgeProficiency,
};
