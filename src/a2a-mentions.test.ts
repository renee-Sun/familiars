import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseA2AMentions, type MentionCatalogEntry } from './a2a-mentions.js';

const catalog: MentionCatalogEntry[] = [
  { id: 'deepseek', name: '福多多', aliases: ['福宝', '多宝', '多多'] },
  { id: 'glm', name: 'Dobby', aliases: [] },
  { id: 'kimi', name: 'Hedwig', aliases: [] },
];

test('空文本返回空', () => {
  assert.deepEqual(parseA2AMentions('', 'deepseek', catalog), []);
});

test('行首 @ 名字命中', () => {
  assert.deepEqual(parseA2AMentions('@Dobby 帮我看下这个', 'deepseek', catalog), ['glm']);
});

test('行首 @ 别名命中', () => {
  assert.deepEqual(parseA2AMentions('@多多 你来', 'glm', catalog), ['deepseek']);
});

test('过滤自己', () => {
  assert.deepEqual(parseA2AMentions('@Dobby 你来', 'glm', catalog), []);
});

test('非行首 @ 不触发（正文里提到）', () => {
  assert.deepEqual(parseA2AMentions('我之前问过 @Dobby 这个问题', 'deepseek', catalog), []);
});

test('@Dobbyist 不误命中 Dobby', () => {
  assert.deepEqual(parseA2AMentions('@Dobbyist 不是 Dobby', 'deepseek', catalog), []);
});

test('大小写不敏感', () => {
  assert.deepEqual(parseA2AMentions('@dobby 你来', 'deepseek', catalog), ['glm']);
});

test('代码块里的 @ 被剥离', () => {
  assert.deepEqual(parseA2AMentions('```\n@Dobby\n```\n@Hedwig 你来', 'deepseek', catalog), ['kimi']);
});

test('最多返回 2 只', () => {
  const text = '@福多多 你先\n@Dobby 你接着\n@Hedwig 你最后';
  const r = parseA2AMentions(text, 'someone-else', catalog);
  assert.deepEqual(r, ['deepseek', 'glm']);
});
