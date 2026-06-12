/**
 * AI 多模型服务层
 * 支持千问/豆包/OpenAI 等 OpenAI-compatible API
 *
 * 核心职责：
 * 1. 根据卡片信息生成学习场景
 * 2. 判断用户回复的掌握程度
 */

import OpenAI from 'openai';

/**
 * 从 AI 返回的文本中鲁棒地提取 JSON 对象
 *
 * LLM API（尤其是千问/豆包等兼容接口）即使设置了 response_format: json_object，
 * 也可能在 JSON 前后附加额外文本、将 JSON 包裹在 markdown 代码块中，
 * 或在第一个对象后追加第二个对象/注释。
 *
 * 此函数按优先级尝试：
 * 1. 去掉 markdown 代码块后完整解析
 * 2. 用花括号配对提取第一个完整 JSON 对象
 * 3. 直接 trim 后解析
 */
function parseAIJson(raw) {
  let text = raw.trim();

  // 1. 去掉 markdown 代码块 ```json ... ``` 或 ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // 2. 尝试直接解析
  try {
    return JSON.parse(text);
  } catch (e1) {
    // 继续尝试其他方法
    console.log('[parseAIJson] 直接解析失败:', e1.message);
    console.log('[parseAIJson] 原始文本长度:', raw.length, '处理后长度:', text.length);
    console.log('[parseAIJson] 文本前200字符:', text.slice(0, 200));
    console.log('[parseAIJson] 文本后200字符:', text.slice(-200));
  }

  // 3. 用花括号配对提取第一个完整 JSON 对象
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0, inString = false, escaped = false;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(firstBrace, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (e2) {
            console.log('[parseAIJson] 花括号提取也失败:', e2.message);
            console.log('[parseAIJson] 提取内容长度:', candidate.length);
            console.log('[parseAIJson] 提取内容:', candidate.slice(0, 500));
            break; // 找到了配对的 } 但解析失败，放弃
          }
        }
      }
    }
  } else {
    console.log('[parseAIJson] 未找到左花括号 {');
  }

  // 4. 最后的兜底：直接解析（让错误自然抛出）
  console.log('[parseAIJson] 所有方法均失败，文本全文:\n', text);
  try {
    return JSON.parse(text);
  } catch (finalErr) {
    // 提供更有用的错误信息
    const preview = text.length > 500
      ? text.slice(0, 250) + '\n...\n' + text.slice(-250)
      : text;
    throw new Error(
      `AI 返回内容解析失败: ${finalErr.message}\n\n` +
      `文本长度: ${text.length} 字符\n` +
      `文本预览:\n${preview}`
    );
  }
}

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
  const finalBaseURL = baseURL || preset?.baseURL || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  return {
    client: new OpenAI({ apiKey, baseURL: finalBaseURL }),
    model: model || preset?.defaultModel || 'gpt-4o-mini',
  };
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
async function generateScenario({ cardType, word, concept, knownWords, context, aiConfig }) {
  const { client, model } = createClient(
    aiConfig.provider,
    aiConfig.apiKey,
    aiConfig.baseURL,
    aiConfig.model
  );

  const knownWordList = (knownWords || []).map((w) => w.word).join(', ');

  const systemPrompt = `You are an English tutor following a specific teaching philosophy:
- English is a MOTOR skill, not a thinking skill. Students learn by DOING, not by analyzing.
- NEVER use Chinese in your responses. NEVER translate.
- Use words the student already knows as much as possible.
- All communication should be immersive — help students think directly in English.
- The goal is conveying MEANING, not perfect grammar.

The student is learning in this context: "${context}".`;

  const cardTypePrompts = {
    read: `Generate a READING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList || '(none yet — use only the most basic English)'}

INSTRUCTIONS:
1. Write a short paragraph (3-5 sentences) that naturally contains the word "${word}".
2. Ask the student a question that tests whether they UNDERSTOOD the meaning (not the translation).
3. The question should require them to demonstrate comprehension, e.g., "What is happening in the scene?" or "How does the character feel?"

Respond in JSON format:
{
  "scenario": "the paragraph text here",
  "question": "the comprehension question here",
  "hint": "an optional hint to help if they're stuck (still in English)"
}`,

    write: `Generate a WRITING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList || '(none yet — use only the most basic English)'}

INSTRUCTIONS:
1. Describe a real-life scenario where the student needs to express something using the word "${word}" (or its related forms).
2. Ask them to TYPE what they would say/write in that situation.
3. Make the scenario concrete and easy to imagine.

Respond in JSON format:
{
  "scenario": "description of the situation",
  "task": "what they need to write (e.g., 'Type what you would say to your friend')",
  "hint": "an optional hint (still in English)"
}`,

    listen: `Generate a LISTENING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList || '(none yet — use only the most basic English)'}

INSTRUCTIONS:
1. Write a sentence (or short dialogue) that naturally contains the word "${word}".
2. This will be played as audio to the student.
3. After they hear it, ask a question that tests if they understood the meaning.
4. Keep the sentence clear and at an appropriate speed-level.

Respond in JSON format:
{
  "audioText": "the sentence to be spoken aloud",
  "question": "the comprehension question after they hear it",
  "hint": "an optional hint"
}`,

    speak: `Generate a SPEAKING exercise for the word "${word}".

The meaning/concept is: "${concept}" (you know this but do NOT mention Chinese).

The student already knows these words: ${knownWordList || '(none yet — use only the most basic English)'}

INSTRUCTIONS:
1. Describe a scenario where the student would naturally want to say something using the word "${word}".
2. Ask them to SPEAK their response aloud.
3. Note what pronunciation elements to listen for.

Respond in JSON format:
{
  "scenario": "description of the situation",
  "task": "what they should say (e.g., 'Say aloud what you would tell your colleague')",
  "pronunciationNotes": "key sounds to listen for (for the AI to check later)"
}`,
  };

  const prompt = cardTypePrompts[cardType] || cardTypePrompts.read;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  const rawContent = response.choices[0].message.content;
  console.log('[generateScenario] AI 原始返回长度:', rawContent.length);
  console.log('[generateScenario] AI 原始返回:\n', rawContent);
  const result = parseAIJson(rawContent);
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
 * @returns {{ ease: number, feedback: string, continue: boolean, newScenario: object|null }}
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
}) {
  const { client, model } = createClient(
    aiConfig.provider,
    aiConfig.apiKey,
    aiConfig.baseURL,
    aiConfig.model
  );

  const systemPrompt = `You are a supportive English tutor evaluating a student's response.

CORE PRINCIPLES:
- Judge whether the student CONVEYED THE MEANING, not whether grammar is perfect.
- Be encouraging. The goal is communication, not perfection.
- If the student is clearly struggling (failCount=${failCount}), either lower the difficulty or give a low score so they can move on — DON'T let them feel stuck and lose confidence.

SCORING GUIDE:
- ease=1 (Again): Student clearly didn't understand the word's meaning, or gave a completely wrong response. They need to retry later.
- ease=3 (Good): Student demonstrated basic understanding. Some errors are fine.
- ease=4 (Easy): Student clearly understood and responded naturally/correctly.

RESPOND IN JSON:
{
  "ease": 1, 3, or 4,
  "feedback": "brief encouraging feedback in English (1-2 sentences). Include a hint or correction if they struggled."
}`;

  const historySummary = (history || [])
    .slice(-4)
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Card type: ${cardType}
Target word: "${word}"
Target meaning: "${concept}"

Scenario: ${JSON.stringify(scenario)}

Recent conversation:
${historySummary}

Student's latest response: "${userResponse}"

Evaluate the student's understanding. Remember: ${failCount > 1 ? 'They have struggled ' + failCount + ' times. Be extra lenient or suggest moving on.' : 'This is attempt ' + (failCount + 1) + '.'}`,
      },
    ],
    temperature: 0.5,
    response_format: { type: 'json_object' },
  });

  const rawContent = response.choices[0].message.content;
  console.log('[judgeResponse] AI 原始返回长度:', rawContent.length);
  console.log('[judgeResponse] AI 原始返回:\n', rawContent);
  const result = parseAIJson(rawContent);
  return {
    ease: Math.max(1, Math.min(4, Math.round(result.ease))),
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
