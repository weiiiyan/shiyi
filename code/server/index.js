/**
 * MaiMemoAiChat 后端服务
 *
 * 负责代理 Anki-Connect 请求、AI API 调用、会话管理。
 * 运行在 localhost:3001，与 Vite dev server (5173) 配合使用。
 */

import express from 'express';
import cors from 'cors';
import decksRouter from './routes/decks.js';
import learnRouter from './routes/learn.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api/decks', decksRouter);
app.use('/api/learn', learnRouter);
app.use('/api/ai', aiRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 全局错误处理
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`MaiMemoAiChat server running on http://localhost:${PORT}`);
});
