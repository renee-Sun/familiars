import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, hybridRecall } from './memory.js';
import type { Memory } from './memory-store.js';

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

test('hybridRecall：关键词命中优先、语义命中补空缺', () => {
  const memories: Memory[] = [
    { id: '1', type: 'lesson', text: 'pnpm 的 build 脚本要 allowBuilds 放行', createdAt: 1, vector: [0, 1, 0] },
    { id: '2', type: 'fact', text: '依赖安装失败时可清缓存重试', createdAt: 2, vector: [1, 0, 0] },
  ];
  const r = hybridRecall('pnpm install 报错', [1, 0, 0], memories);
  assert.deepEqual(r.map((m) => m.id), ['1', '2']);
});

test('hybridRecall：语义召回命中字面不重合的记忆', () => {
  const memories: Memory[] = [
    { id: '1', type: 'fact', text: '服务监听 3210', createdAt: 1, vector: [1, 0, 0] },
    { id: '2', type: 'fact', text: '配色用暖橙', createdAt: 2, vector: [0, 1, 0] },
  ];
  // 查询和"服务监听 3210"字面不重合（无共同关键词），但向量同向 → 语义召回
  const r = hybridRecall('部署在哪个端口', [1, 0, 0], memories);
  assert.deepEqual(r.map((m) => m.id), ['1']);
});

test('hybridRecall：低于阈值的语义结果被过滤', () => {
  const memories: Memory[] = [{ id: '1', type: 'fact', text: '服务监听 3210', createdAt: 1, vector: [0, 1, 0] }];
  // 查询向量和记忆向量正交（相似度 0 < 阈值 0.5）→ 不召回
  const r = hybridRecall('部署在哪个端口', [1, 0, 0], memories);
  assert.deepEqual(r, []);
});

test('hybridRecall：空查询向量退化为纯关键词召回', () => {
  const memories: Memory[] = [
    { id: '1', type: 'fact', text: '服务监听 3210', createdAt: 1, vector: [1, 0, 0] },
    { id: '2', type: 'fact', text: 'deploy_port 是 3210', createdAt: 2 },
  ];
  const r = hybridRecall('deploy_port 是多少', [], memories);
  assert.deepEqual(r.map((m) => m.id), ['2']);
});

test('hybridRecall：limit 生效、去重', () => {
  const memories: Memory[] = [
    { id: '1', type: 'fact', text: 'deploy_port 是 3210', createdAt: 1, vector: [1, 0, 0] },
    { id: '2', type: 'fact', text: '部署端口 3210', createdAt: 2, vector: [1, 0, 0] },
    { id: '3', type: 'fact', text: '服务监听 3210', createdAt: 3, vector: [1, 0, 0] },
  ];
  const r = hybridRecall('deploy_port 是多少', [1, 0, 0], memories, { limit: 2 });
  assert.equal(r.length, 2);
  // 关键词命中 '1'（含 deploy_port），其余按语义补；不应有重复
  assert.equal(new Set(r.map((m) => m.id)).size, 2);
});
