import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedContext } from './shared-context.js';
import type { HistoryMessage } from './history-store.js';

test('buildSharedContext 空历史返回空串', () => {
  assert.equal(buildSharedContext([]), '');
});

test('buildSharedContext 列出用户和每个成员名', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: '第一问' },
    { role: 'agent', name: '福多多', text: '回答一' },
    { role: 'agent', name: 'Dobby', text: '回答二' },
  ];
  const ctx = buildSharedContext(msgs);
  assert.ok(ctx.includes('用户'));
  assert.ok(ctx.includes('福多多'));
  assert.ok(ctx.includes('Dobby'));
});

test('buildSharedContext 按 limit 只取最近', () => {
  const msgs: HistoryMessage[] = [
    { role: 'user', text: '第一问' },
    { role: 'agent', name: '福多多', text: '回答一' },
    { role: 'agent', name: 'Dobby', text: '回答二' },
  ];
  const ctx = buildSharedContext(msgs, { limit: 1 });
  assert.ok(ctx.includes('Dobby'));
  assert.ok(!ctx.includes('福多多'));
});

test('buildSharedContext 截断超长消息并加省略号', () => {
  const msgs: HistoryMessage[] = [{ role: 'user', text: 'x'.repeat(500) }];
  const ctx = buildSharedContext(msgs, { maxChars: 10 });
  assert.ok(ctx.includes('…'));
  assert.ok(!ctx.includes('x'.repeat(11)));
});
