import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMemories, recall, memoryTypeLabel } from './memory.js';
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

test('recall 按关键词命中召回并排序', () => {
  const memories: Memory[] = [
    { id: '1', type: 'lesson', text: 'pnpm 的 build 脚本默认 deny，要 allowBuilds 放行', createdAt: 1 },
    { id: '2', type: 'fact', text: '项目在 localhost:3210 运行', createdAt: 2 },
    { id: '3', type: 'decision', text: '用 pnpm 作为包管理器', createdAt: 3 },
  ];
  const r = recall('pnpm install 报错', memories);
  assert.equal(r.length, 2);
  assert.equal(r[0]!.id, '1');
});

test('recall 无命中返回空', () => {
  const memories: Memory[] = [{ id: '1', type: 'fact', text: '项目在 localhost 运行', createdAt: 1 }];
  assert.deepEqual(recall('redis', memories), []);
});

test('memoryTypeLabel', () => {
  assert.equal(memoryTypeLabel('lesson'), '教训');
  assert.equal(memoryTypeLabel('decision'), '决策');
  assert.equal(memoryTypeLabel('fact'), '事实');
});
