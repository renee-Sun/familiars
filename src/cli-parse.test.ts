import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from './cli-parse.js';

test('无参数返回 help', () => {
  assert.equal(parseCliArgs([]).kind, 'help');
});

test('单目标 @福多多', () => {
  const r = parseCliArgs(['@福多多', '你好']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.equal(r.targets.length, 1);
    assert.equal(r.targets[0]?.id, 'deepseek');
    assert.equal(r.prompt, '你好');
  }
});

test('多目标 @福多多 @Dobby', () => {
  const r = parseCliArgs(['@福多多', '@Dobby', '你好']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.deepEqual(r.targets.map((t) => t.id), ['deepseek', 'glm']);
    assert.equal(r.prompt, '你好');
  }
});

test('不带 @ 的多目标 Dobby Hedwig', () => {
  const r = parseCliArgs(['Dobby', 'Hedwig', '聊一下']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.deepEqual(r.targets.map((t) => t.id), ['glm', 'kimi']);
  }
});

test('同一成员多个别名只算一次', () => {
  const r = parseCliArgs(['@福多多', '@多多', '你好']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.deepEqual(r.targets.map((t) => t.id), ['deepseek']);
  }
});

test('prompt 里的成员名不会误判为目标', () => {
  const r = parseCliArgs(['@福多多', '聊', 'Dobby', '的看法']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.deepEqual(r.targets.map((t) => t.id), ['deepseek']);
    assert.equal(r.prompt, '聊 Dobby 的看法');
  }
});

test('@all 广播', () => {
  const r = parseCliArgs(['@all', '你好']);
  assert.equal(r.kind, 'broadcast');
});

test('--reset', () => {
  const r = parseCliArgs(['--reset', '@福多多']);
  assert.equal(r.kind, 'reset');
  if (r.kind === 'reset') assert.equal(r.target.id, 'deepseek');
});

test('多目标但没带问题 → error', () => {
  assert.equal(parseCliArgs(['@福多多', '@Dobby']).kind, 'error');
});

test('未知目标 → error', () => {
  assert.equal(parseCliArgs(['@不存在的动物', '你好']).kind, 'error');
});

test('小写 @ 多目标也认：@dobby @hedwig', () => {
  const r = parseCliArgs(['@dobby', '@hedwig', 'hi']);
  assert.equal(r.kind, 'directed');
  if (r.kind === 'directed') {
    assert.deepEqual(r.targets.map((t) => t.id), ['glm', 'kimi']);
    assert.equal(r.prompt, 'hi');
  }
});

test('@All 广播大小写不敏感', () => {
  assert.equal(parseCliArgs(['@All', '你好']).kind, 'broadcast');
});
