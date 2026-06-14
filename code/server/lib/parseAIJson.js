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
 *
 * @param {string} raw - AI 返回的原始文本
 * @returns {Object} 解析后的 JSON 对象
 * @throws {Error} 当所有解析方法均失败时，抛出带详细信息的错误
 */
export function parseAIJson(raw) {
  let text = raw.trim();

  // 1. 去掉 markdown 代码块 ```json ... ``` 或 ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // 2. 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试其他方法
  }

  // 3. 用花括号配对提取第一个完整 JSON 对象
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(firstBrace, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break; // 找到了配对的 } 但解析失败，放弃
          }
        }
      }
    }
  }

  // 4. 最后的兜底：直接解析（让错误自然抛出）
  try {
    return JSON.parse(text);
  } catch (finalErr) {
    const preview =
      text.length > 500
        ? text.slice(0, 250) + '\n...\n' + text.slice(-250)
        : text;
    throw new Error(
      `AI 返回内容解析失败: ${finalErr.message}\n\n` +
        `文本长度: ${text.length} 字符\n` +
        `文本预览:\n${preview}`
    );
  }
}
