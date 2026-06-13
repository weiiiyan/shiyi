/**
 * 向 ShiYi::职场 牌组添加 2 个测试笔记
 *
 * 前置条件：Anki 正在运行，Anki-Connect 插件已安装
 * 用法：node test_add_notes.mjs
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

async function main() {
  console.log('── 1. 检查 Anki-Connect 连接 ──');
  try {
    const version = await invoke('version');
    console.log(`  ✅ Anki-Connect v${version} 已连接\n`);
  } catch (err) {
    console.log(`  ❌ 无法连接 Anki-Connect: ${err.message}`);
    console.log('  请确保 Anki 正在运行且 Anki-Connect 插件已安装。\n');
    process.exit(1);
  }

  // 查看所有牌组
  console.log('── 2. 当前所有牌组 ──');
  const allDecks = await invoke('deckNames');
  const shiYiDecks = allDecks.filter(d => d.startsWith('ShiYi'));
  console.log(`  ShiYi 相关牌组:`);
  for (const d of shiYiDecks) {
    console.log(`    - ${d}`);
  }
  console.log();

  // 查看所有笔记类型
  console.log('── 3. 当前所有笔记类型（模型）──');
  const models = await invoke('modelNames');
  for (const m of models) {
    console.log(`  - ${m}`);
  }
  console.log();

  // 直接使用 ShiYi-Immersion 模型
  const modelToUse = 'ShiYi-Immersion';
  console.log(`── 4. 使用模型: "${modelToUse}" ──`);

  // 获取模型字段
  const modelFieldNames = await invoke('modelFieldNames', { modelName: modelToUse });
  console.log('  字段:', modelFieldNames.join(', '));
  console.log();

  // 确认目标牌组存在
  const targetDeck = 'ShiYi::职场';
  if (!allDecks.includes(targetDeck)) {
    console.log(`  ⚠️ 牌组 "${targetDeck}" 不存在，将创建`);
  } else {
    console.log(`  ✅ 牌组 "${targetDeck}" 存在`);
  }
  console.log();

  // 添加 2 个测试笔记
  console.log('── 5. 添加测试笔记 ──\n');

  const testNotes = [
    {
      deckName: targetDeck,
      modelName: modelToUse,
      fields: {
        concept: '敏捷开发',
        word: 'Agile Development',
        card_type: 'read',
        sub_deck: '职场',
        examples: JSON.stringify([
          'Our team adopted Agile Development to improve delivery speed.',
          'Agile Development emphasizes iterative progress and collaboration.'
        ]),
        context: '软件开发方法论',
      },
      tags: ['test', '职场'],
    },
    {
      deckName: targetDeck,
      modelName: modelToUse,
      fields: {
        concept: '绩效评估',
        word: 'Performance Review',
        card_type: 'read',
        sub_deck: '职场',
        examples: JSON.stringify([
          'The annual performance review is scheduled for next week.',
          'Performance reviews help employees understand their strengths and areas for improvement.'
        ]),
        context: '人力资源管理',
      },
      tags: ['test', '职场'],
    },
  ];

  for (let i = 0; i < testNotes.length; i++) {
    const note = testNotes[i];
    try {
      const noteId = await invoke('addNote', { note });
      console.log(`  ✅ 笔记 ${i + 1} 添加成功！`);
      console.log(`     Note ID: ${noteId}`);
      console.log(`     Concept: ${note.fields.concept}`);
      console.log(`     Word: ${note.fields.word}`);
      console.log();
    } catch (err) {
      console.log(`  ❌ 笔记 ${i + 1} 添加失败: ${err.message}`);
      console.log();
    }
  }

  console.log('── 完成 ──');
  console.log('  可以在 Anki 浏览器中查看新添加的测试笔记。\n');
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
