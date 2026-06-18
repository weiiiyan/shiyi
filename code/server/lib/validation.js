/**
 * 共享请求参数校验工具
 *
 * 每个校验器返回 { valid: boolean, error?: string } 格式的结果。
 * 调用方使用 assertValid() 在无效时抛出错误，或自行处理。
 */

/**
 * 校验牌组 ID
 * @param {*} deckId
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
export function validateDeckId(deckId) {
  if (!deckId || typeof deckId !== 'string' || deckId.trim().length === 0) {
    return { valid: false, error: '缺少牌组 ID' };
  }
  return { valid: true, value: deckId.trim() };
}

/**
 * 校验 AI 评分 (ease)
 * 合法值：1 (Again), 3 (Good), 4 (Easy)
 * @param {*} ease
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
export function validateEase(ease) {
  if (ease === undefined || ease === null) {
    return { valid: false, error: '缺少评分 (ease)' };
  }
  const num = Number(ease);
  if (!Number.isFinite(num)) {
    return { valid: false, error: '评分必须是数字' };
  }
  // Anki 接受 1-4，本应用仅使用 1/3/4
  const rounded = Math.round(num);
  if (rounded < 1 || rounded > 4) {
    return { valid: false, error: '评分必须在 1-4 之间' };
  }
  return { valid: true, value: rounded };
}

/**
 * 校验 AI 配置
 * @param {Object} config
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAiConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: '缺少 AI 配置' };
  }
  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
    return { valid: false, error: '请填写 API Key' };
  }
  return { valid: true };
}

/**
 * 校验对象中是否存在必填字段
 * @param {Object} obj
 * @param {string[]} fields
 * @returns {{ valid: boolean, missing?: string[], error?: string }}
 */
export function validateRequired(obj, fields) {
  const missing = [];
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      error: `缺少必填字段: ${missing.join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * 断言校验通过，失败时抛出错误
 * @param {{ valid: boolean, error?: string }} result
 * @throws {Error}
 */
export function assertValid(result) {
  if (!result.valid) {
    throw new Error(result.error || '校验失败');
  }
}

/**
 * 将数值限制在指定范围内（用于 ease 评分限制）
 * @param {number} value - 要限制的值
 * @param {number} [min] - 最小值，默认 1
 * @param {number} [max] - 最大值，默认 4
 * @returns {number} 限制后的值
 */
export function clampEase(value, min = 1, max = 4) {
  const rounded = Math.round(value);
  return Math.max(min, Math.min(max, rounded));
}
