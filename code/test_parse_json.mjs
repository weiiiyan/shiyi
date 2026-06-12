/**
 * 测试 parseAIJson 对各种 AI 返回格式的处理能力
 */
import OpenAI from 'openai';

// 复制 parseAIJson 函数（不依赖日志）
function parseAIJson(raw) {
  let text = raw.trim();

  // 1. 去掉 markdown 代码块
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // 2. 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续
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
          } catch {
            break;
          }
        }
      }
    }
  }

  // 4. 兜底
  return JSON.parse(text);
}

// 测试用例
const tests = [
  {
    name: '纯 JSON（正常情况）',
    input: '{"scenario":"test","question":"q?"}',
    shouldPass: true,
  },
  {
    name: 'JSON 后面有额外文本',
    input: '{"scenario":"test","question":"q?"}\nSome extra text here.',
    shouldPass: true,
  },
  {
    name: 'Markdown 代码块包裹',
    input: '```json\n{"scenario":"test","question":"q?"}\n```',
    shouldPass: true,
  },
  {
    name: 'Markdown 代码块 + 前后文本',
    input: 'Here is the scenario:\n```json\n{"scenario":"test","question":"q?"}\n```\nHope this helps!',
    shouldPass: true,
  },
  {
    name: 'JSON 内字符串含花括号',
    input: '{"scenario":"He said {hello} to everyone","question":"What {did} he say?"}',
    shouldPass: true,
  },
  {
    name: 'JSON 内字符串含转义引号',
    input: '{"scenario":"He said \\"hello\\" to everyone","question":"What did he say?"}',
    shouldPass: true,
  },
  {
    name: 'JSON 内嵌套对象（pronunciationNotes）',
    input: '{"scenario":"test","task":"say something","pronunciationNotes":"Listen for {th} sound"}\nExtra.',
    shouldPass: true,
  },
  {
    name: '多个 JSON 对象（AI 幻觉）',
    input: '{"first":"obj"}\n{"second":"obj"}',
    shouldPass: true,
  },
  {
    name: 'JSON 前有文本，后有文本',
    input: 'OK here you go:\n{"scenario":"test","question":"q?"}\nLet me know if you need changes.',
    shouldPass: true,
  },
  {
    name: '长文本场景（模拟真实返回）',
    input: `{"scenario":"John walked into the bustling cafe, the aroma of freshly brewed coffee filling the air. He scanned the room, looking for an empty seat. The barista called out his name, and he made his way to the counter.","question":"What sensory details tell you the cafe is busy?","hint":"Think about what John sees, smells, and hears in the cafe."}
Some extra commentary that the AI sometimes adds despite being told to return JSON only.`,
    shouldPass: true,
  },
  {
    name: '仅含 ``` 无 json 标记',
    input: '```\n{"scenario":"test","question":"q?"}\n```',
    shouldPass: true,
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  try {
    const result = parseAIJson(t.input);
    const ok = t.shouldPass;
    if (ok) {
      console.log(`✅ ${t.name}`);
      passed++;
    } else {
      console.log(`❌ ${t.name} — 预期应失败但成功了:`, JSON.stringify(result));
      failed++;
    }
  } catch (err) {
    if (!t.shouldPass) {
      console.log(`✅ ${t.name} — 预期失败:`, err.message);
      passed++;
    } else {
      console.log(`❌ ${t.name} — 失败:`, err.message);
      console.log('  输入:', t.input.slice(0, 200));
      failed++;
    }
  }
}

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
