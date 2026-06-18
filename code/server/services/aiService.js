/**
 * AI 多模型服务层
 * 支持千问/豆包/OpenAI 等 OpenAI-compatible API
 *
 * 核心职责：
 * 1. 根据卡片信息生成学习场景
 * 2. 判断用户回复的掌握程度
 */

import OpenAI from 'openai';
import proficiencyService from './proficiencyService.js';
import { parseAIJson } from '../lib/parseAIJson.js';
import { clampEase } from '../lib/validation.js';

// Constants
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const SCENARIO_TEMPERATURE = 0.9;
const JUDGE_TEMPERATURE = 0.5;
const JSON_RESPONSE_FORMAT = { type: 'json_object' };
const KNOWN_WORDS_NONE = '(none yet — use only the most basic English)';

// 预设模型配置
const MODEL_PRESETS = {
  qwen: {
    name: '千问 (Qwen)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-omni-turbo', 'qwen-vl-plus', 'qwen-vl-max'],
    defaultModel: 'qwen-plus',
  },
  doubao: {
    name: '豆包 (Doubao)',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-1.5-pro-256k', 'doubao-1.5-lite-32k'],
    defaultModel: 'doubao-1.5-pro-256k',
  },
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
  },
  custom: {
    name: '自定义',
    baseURL: '',
    models: [],
    defaultModel: '',
  },
};

/**
 * 创建 AI 客户端
 */
function createClient(provider, apiKey, baseURL, model) {
  const preset = MODEL_PRESETS[provider];
  const finalBaseURL = baseURL || preset?.baseURL || DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  return {
    client: new OpenAI({ apiKey, baseURL: finalBaseURL }),
    model: model || preset?.defaultModel || DEFAULT_MODEL,
  };
}

/**
 * 提取已知词汇列表字符串
 */
function formatKnownWords(knownWords) {
  return knownWords?.map(w => w.word).join(', ') || KNOWN_WORDS_NONE;
}

/**
 * 调用 AI 并解析 JSON 响应
 */
async function callAI(client, model, messages, temperature) {
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    response_format: JSON_RESPONSE_FORMAT,
  });
  return parseAIJson(response.choices[0].message.content);
}

/**
 * 基础系统提示模板
 */
const BASE_SYSTEM_PROMPT = `You are an English tutor following a specific teaching philosophy:
- English is a MOTOR skill, not a thinking skill. Students learn by DOING, not by analyzing.
- NEVER use Chinese in your responses. NEVER translate.
- Use words the student already knows as much as possible.
- All communication should be immersive — help students think directly in English.
- The goal is conveying MEANING, not perfect grammar.
- BE CONCISE. Every exercise should fit in 2-3 short sentences. Never write paragraphs.
- VARY your scenarios widely. Rotate through different settings: daily life, travel, food, technology, work, hobbies, shopping, health. Never repeat the same setting consecutively.`;

/**
 * 卡片类型提示模板
 */
const CARD_TYPE_PROMPT_TEMPLATES = {
  read: (word, concept, knownWordList) => `Generate a READING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList}

INSTRUCTIONS:
1. Write 2-3 short, punchy sentences that naturally contain the word "${word}". Bold it as **${word}**.
2. Ask the student a question that tests whether they UNDERSTOOD the meaning (not the translation).
3. The question should require them to demonstrate comprehension, e.g., "What is happening?" or "How does the character feel?"

VARIETY: Use a completely different setting from any previous exercise. Rotate among: everyday conversation, news headline, social media post, short story, email, review, instruction. Never reuse the same theme consecutively.

Respond in JSON format:
{
  "scenario": "the paragraph text here (use **word** to bold the target word)",
  "question": "the comprehension question here",
  "hint": "an optional hint to help if they're stuck (still in English, keep it short)"
}`,

  write: (word, concept, knownWordList) => `Generate a WRITING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList}

INSTRUCTIONS:
1. In 2-3 sentences, describe a real-life situation where the student needs to express something using the word "${word}" (or its related forms).
2. Ask them to TYPE what they would say/write in that situation.
3. Make the scenario concrete and easy to imagine.

VARIETY: Use a different setting than the last exercise. Rotate: everyday conversation, short story, news, social media post, email, travel, food, daily problem.

Respond in JSON format:
{
  "scenario": "brief description of the situation",
  "task": "what they need to write (e.g., 'Type what you would say to your friend')",
  "hint": "an optional brief hint (still in English)"
}`,

  listen: (word, concept, knownWordList) => `Generate a LISTENING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList}

INSTRUCTIONS:
1. Write one clear sentence (or 2-line dialogue) that naturally contains the word "${word}".
2. This will be played as audio to the student.
3. After they hear it, ask a question that tests if they understood the meaning.
4. Keep the sentence short and clear — easy to understand when heard.

VARIETY: Use a different setting than the last exercise. Rotate: advice, observation, question, exclamation, dialogue.

Respond in JSON format:
{
  "audioText": "the short sentence to be spoken aloud",
  "question": "the comprehension question after they hear it",
  "hint": "an optional brief hint"
}`,

  speak: (word, concept, knownWordList) => `Generate a SPEAKING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList}

INSTRUCTIONS:
1. In 2-3 sentences, describe a scenario where the student would naturally want to say something using the word "${word}".
2. Ask them to SPEAK their response aloud.
3. Note what pronunciation elements to listen for.

VARIETY: Use a different setting than the last exercise. Rotate: casual chat, formal meeting, phone call, shopping, travel, giving advice, asking for help.

Respond in JSON format:
{
  "scenario": "brief description of the situation",
  "task": "what they should say (e.g., 'Say aloud what you would tell your colleague')",
  "pronunciationNotes": "key sounds to listen for"
}`,
};

/**
 * 构建场景去重提示
 */
function buildDedupInstruction(previousScenarios) {
  if (previousScenarios.length === 0) return '';
  return `\n\nIMPORTANT: This word has already been practiced ${previousScenarios.length} time(s) in this session. Generate a COMPLETELY DIFFERENT scenario — change the setting, characters, and situation entirely. Do NOT reuse any previous theme.`;
}

/**
 * 构建失败次数提示
 */
function buildFailCountMessage(failCount) {
  if (failCount > 1) {
    return `They have struggled ${failCount} times. Be extra lenient or suggest moving on.`;
  }
  return `This is attempt ${failCount + 1}.`;
}

/**
 * 根据卡片类型生成学习场景
 *
 * @param {Object} params
 * @param {string} params.cardType - read/write/listen/speak
 * @param {string} params.word - 目标单词
 * @param {string} params.concept - 概念描述（中文，仅供参考，生成场景时不输出中文）
 * @param {Array} params.knownWords - 用户已掌握的词汇列表 [{word, concept}]
 * @param {string} params.context - 场景上下文
 * @param {Object} params.aiConfig - AI 配置 {provider, apiKey, baseURL, model}
 */
async function generateScenario({ cardType, word, concept, knownWords, context, aiConfig, previousScenarios = [], proficiencyConfig }) {
  const { client, model } = createClient(
    aiConfig.provider,
    aiConfig.apiKey,
    aiConfig.baseURL,
    aiConfig.model
  );

  const knownWordList = formatKnownWords(knownWords);
  const proficiencyPrompt = proficiencyService.buildScenarioProficiency(proficiencyConfig, cardType);
  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nThe student is learning in this context: "${context}".${proficiencyPrompt}`;

  const promptTemplate = CARD_TYPE_PROMPT_TEMPLATES[cardType] || CARD_TYPE_PROMPT_TEMPLATES.read;
  const prompt = promptTemplate(word, concept, knownWordList) + buildDedupInstruction(previousScenarios);

  return callAI(client, model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ], SCENARIO_TEMPERATURE);
}

/**
 * 格式化对话历史为字符串
 */
function formatHistory(history, limit = 4) {
  if (!history || history.length === 0) return '';
  let result = '';
  const start = Math.max(0, history.length - limit);
  for (let i = start; i < history.length; i++) {
    result += `${history[i].role}: ${history[i].content}\n`;
  }
  return result;
}

/**
 * 判断用户回复的掌握程度
 *
 * @param {Object} params
 * @param {string} params.cardType - 卡片类型
 * @param {string} params.word - 目标单词
 * @param {string} params.concept - 概念描述
 * @param {string} params.scenario - 当前场景内容
 * @param {string} params.userResponse - 用户回复
 * @param {Array} params.history - 对话历史 [{role, content}]
 * @param {number} params.failCount - 连续失败次数
 * @param {Object} params.aiConfig - AI 配置
 * @returns {{ ease: number, feedback: string }}
 */
async function judgeResponse({
  cardType,
  word,
  concept,
  scenario,
  userResponse,
  history,
  failCount,
  aiConfig,
  proficiencyConfig,
}) {
  const { client, model } = createClient(
    aiConfig.provider,
    aiConfig.apiKey,
    aiConfig.baseURL,
    aiConfig.model
  );

  const judgeProficiencyPrompt = proficiencyService.buildJudgeProficiency(proficiencyConfig, cardType);

  const systemPrompt = `You are a supportive English tutor evaluating a student's response.

CORE PRINCIPLES:
- Judge whether the student CONVEYED THE MEANING, not whether grammar is perfect.
- Be encouraging. The goal is communication, not perfection.
- If the student is clearly struggling (failCount=${failCount}), either lower the difficulty or give a low score so they can move on.

SCORING GUIDE:
- ease=1 (Again): Student clearly didn't understand the word's meaning.
- ease=3 (Good): Student demonstrated basic understanding. Some errors are fine.
- ease=4 (Easy): Student clearly understood and responded naturally/correctly.${judgeProficiencyPrompt}

FEEDBACK RULES (CRITICAL):
- Write exactly ONE short sentence. Not two. Not a paragraph.
- NEVER start with "Great job!", "Well done!", "Good work!", "Excellent!", or any generic praise opener. Start directly with substance.
- Vary your sentence structure. Do not use the same pattern twice.
- Be specific: mention what they understood well OR what they missed.

RESPOND IN JSON:
{
  "ease": 1, 3, or 4,
  "feedback": "one specific, varied sentence"
}`;

  const historySummary = formatHistory(history, 4);
  const failCountMsg = buildFailCountMessage(failCount);

  const userPrompt = `Card type: ${cardType}
Target word: "${word}"
Target meaning: "${concept}"

Scenario: ${JSON.stringify(scenario)}

Recent conversation:
${historySummary}
Student's latest response: "${userResponse}"

Evaluate the student's understanding. REMINDER: Do not start with generic praise. One specific, short sentence only. ${failCountMsg}`;

  const result = await callAI(client, model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], JUDGE_TEMPERATURE);

  return {
    ease: clampEase(result.ease),
    feedback: result.feedback || '',
  };
}

/**
 * 验证 AI 配置是否可用
 */
async function testConnection(provider, apiKey, baseURL, model) {
  try {
    const { client, model: modelName } = createClient(provider, apiKey, baseURL, model);
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }],
      max_tokens: 5,
    });
    return { ok: true, message: response.choices[0].message.content };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export default {
  MODEL_PRESETS,
  generateScenario,
  judgeResponse,
  testConnection,
};
