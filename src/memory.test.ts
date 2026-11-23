import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMemories,
  extractKeywords,
  cosineSimilarity,
  memoryTypeLabel,
  unionById,
  computeRecencyFactor,
  jaccardSimilarity,
  applyMMR,
} from './memory.js';
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

test('unionById：按 id 去重合并、保序', () => {
  const a: Memory = { id: '1', type: 'fact', text: 'a', createdAt: 1 };
  const b: Memory = { id: '2', type: 'fact', text: 'b', createdAt: 2 };
  assert.deepEqual(unionById([a], [a, b]).map((m) => m.id), ['1', '2']);
});

test('computeRecencyFactor：新鲜=1、半衰期处=0.5、随时间衰减', () => {
  const now = 1_000_000_000_000;
  assert.equal(computeRecencyFactor(now, now, 45), 1);
  assert.equal(computeRecencyFactor(now - 45 * 86_400_000, now, 45), 0.5);
  assert.equal(computeRecencyFactor(now - 90 * 86_400_000, now, 45), 45 / 135);
});

test('jaccardSimilarity：集合重合度', () => {
  assert.equal(jaccardSimilarity(['a', 'b'], ['b', 'c']), 1 / 3);
  assert.equal(jaccardSimilarity(['a', 'b'], ['a', 'b']), 1);
  assert.equal(jaccardSimilarity(['a'], ['b']), 0);
});

test('applyMMR：候选不足 3×limit 直接取分数最高', () => {
  const a = { memory: { id: '1', type: 'fact' as const, text: 'a', createdAt: 1 }, score: 0.9 };
  const b = { memory: { id: '2', type: 'fact' as const, text: 'b', createdAt: 2 }, score: 0.5 };
  assert.deepEqual(applyMMR([a, b], 1).map((m) => m.id), ['1']);
});

test('applyMMR：候选充足时做多样性重排，避免选一堆重复内容', () => {
  const mk = (id: string, text: string, score: number) => ({
    memory: { id, type: 'fact' as const, text, createdAt: 1 },
    score,
  });
  const items = [
    mk('1', 'pnpm build 脚本报错', 0.9),
    mk('2', 'pnpm build 脚本报错', 0.88),
    mk('3', 'pnpm build 脚本报错', 0.86),
    mk('4', '端口是 3210', 0.7),
    mk('5', '配色用暖橙', 0.6),
    mk('6', '记忆系统用 sqlite', 0.5),
    mk('7', '会话用 resume', 0.4),
    mk('8', '广播只读', 0.3),
    mk('9', '模型单一来源', 0.2),
  ];
  // 前 3 条高分但内容几乎一样，MMR 应跳过高重复的 2/3，选出内容分散的 4 和 5
  assert.deepEqual(applyMMR(items, 3).map((m) => m.id), ['1', '4', '5']);
});

test('memoryTypeLabel', () => {
  assert.equal(memoryTypeLabel('lesson'), '教训');
  assert.equal(memoryTypeLabel('decision'), '决策');
  assert.equal(memoryTypeLabel('fact'), '事实');
});
