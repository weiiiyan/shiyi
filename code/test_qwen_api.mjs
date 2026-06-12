/**
 * 千问 API 快速诊断 - 用本地图片测试多模态
 */
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.API_KEY || 'your-api-key-here';
const IMG_DIR = 'C:/Users/Jondon/Pictures/anki';

async function main() {
  // 找最小的图片文件
  const files = fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png'));
  let smallest = null, smallestSize = Infinity;
  for (const f of files) {
    const stat = fs.statSync(path.join(IMG_DIR, f));
    if (stat.size < smallestSize) { smallest = f; smallestSize = stat.size; }
  }

  const imgPath = path.join(IMG_DIR, smallest);
  const imgBase64 = fs.readFileSync(imgPath).toString('base64');
  const dataUrl = `data:image/png;base64,${imgBase64}`;

  console.log('图片:', smallest, `(${(smallestSize/1024).toFixed(1)}KB)`);
  console.log('测试多模态...\n');

  const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });

  // 测试 qwen-omni-turbo 多模态
  console.log('--- qwen-omni-turbo (多模态图片理解) ---');
  try {
    const r1 = await client.chat.completions.create({
      model: 'qwen-omni-turbo',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '用一句话描述这张图片。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      max_tokens: 100,
    });
    console.log('✅ 成功:', r1.choices[0].message.content);
  } catch (err) {
    console.log('❌ 失败:', err.message);
  }

  // 测试 qwen-vl-plus 多模态
  console.log('\n--- qwen-vl-plus (多模态图片理解) ---');
  try {
    const r2 = await client.chat.completions.create({
      model: 'qwen-vl-plus',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '用一句话描述这张图片。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      max_tokens: 100,
    });
    console.log('✅ 成功:', r2.choices[0].message.content);
  } catch (err) {
    console.log('❌ 失败:', err.message);
  }

  // 测试 qwen-vl-max
  console.log('\n--- qwen-vl-max (多模态图片理解) ---');
  try {
    const r3 = await client.chat.completions.create({
      model: 'qwen-vl-max',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '用一句话描述这张图片。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      max_tokens: 100,
    });
    console.log('✅ 成功:', r3.choices[0].message.content);
  } catch (err) {
    console.log('❌ 失败:', err.message);
  }
}

main().catch(console.error);
