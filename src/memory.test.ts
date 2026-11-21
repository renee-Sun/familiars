import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMemories, extractKeywords, cosineSimilarity, memoryTypeLabel, mergeHybrid } from './memory.js';
import type { Memory } from './memory-store.js';

test('extractMemories 提取"记忆|类型|内容"标记行', () => {
  const text = '这是我的分析。\n记忆|lesson|pnpm build 脚本要 allowBuilds 放行\n记忆|decision|Hedwig 换 DeepSeek Flash';
  assert.deepEqual(extractMemories(text), [
    { type: 'lesson', text: 'pnpm build 脚本要 allowBuilds 放行' },
    { type: 'decision', text: 'Hedwig 换 DeepSeek Flash' },
  ]);
});

test('extractMemories 忽略普通行、空内容、未知类型', () => {
  assert.deepEqual(extractMemories('普通回答'), []);
  assert.deepEqual(extractMemories('记忆|lesson|'), []);
  assert.deepEqual(extractMemories('记忆|unknown|xxx'), []);
});

test('extractMemories 大小写不敏感、支持全角竖线', () => {
  assert.deepEqual(extractMemories('记忆｜Lesson｜内容'), [{ type: 'lesson', text: '内容' }]);
});

test('extractKeywords 按非字词字符切分', () => {
  assert.deepEqual(extractKeywords('pnpm install 报错'), ['pnpm', 'install', '报错']);
  assert.deepEqual(extractKeywords('部署在哪个端口'), ['部署在哪个端口']);
});

test('cosineSimilarity：同向=1，正交=0，反向=-1', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity：空向量或维度不一致返回 0', () => {
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
});

test('cosineSimilarity：缩放无关（模长归一）', () => {
  assert.ok(Math.abs(cosineSimilarity([2, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [2, 2]) - 1) < 1e-9);
});

test('mergeHybrid：关键词命中优先、语义补空缺、去重', () => {
  const a: Memory = { id: '1', type: 'fact', text: 'deploy_port 是 3210', createdAt: 1 };
  const b: Memory = { id: '2', type: 'fact', text: '服务监听 3210', createdAt: 2 };
  const c: Memory = { id: '3', type: 'fact', text: '配色用暖橙', createdAt: 3 };
  // 关键词 [a]，语义 [a(重复), b] → 结果 a, b（a 不重复）
  assert.deepEqual(mergeHybrid([a], [a, b], 3).map((m) => m.id), ['1', '2']);
  // limit 截断
  assert.deepEqual(mergeHybrid([a], [b, c], 2).map((m) => m.id), ['1', '2']);
});

test('memoryTypeLabel', () => {
  assert.equal(memoryTypeLabel('lesson'), '教训');
  assert.equal(memoryTypeLabel('decision'), '决策');
  assert.equal(memoryTypeLabel('fact'), '事实');
});
