/**
 * 统一错误响应辅助函数
 */

/**
 * 发送标准错误响应
 * @param {express.Response} res
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误信息
 * @returns {express.Response}
 */
export function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}
