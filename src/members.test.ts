import { test } from 'node:test';
import assert from 'node:assert/strict';
import { members, resolveMember } from './members.js';

test('members 有三个成员且 id 唯一', () => {
  assert.equal(members.length, 3);
  const ids = members.map((m) => m.id);
  assert.equal(new Set(ids).size, 3);
});

test('resolveMember 按名字、别名、@ 前缀解析', () => {
  assert.equal(resolveMember('福多多')?.id, 'deepseek');
  assert.equal(resolveMember('@福多多')?.id, 'deepseek');
  assert.equal(resolveMember('多多')?.id, 'deepseek'); // 别名
  assert.equal(resolveMember('Dobby')?.id, 'glm');
  assert.equal(resolveMember('Hedwig')?.id, 'kimi');
});

test('resolveMember 大小写不敏感', () => {
  assert.equal(resolveMember('@dobby')?.id, 'glm');
  assert.equal(resolveMember('hedwig')?.id, 'kimi');
  assert.equal(resolveMember('@多多')?.id, 'deepseek');
});

test('resolveMember 未知返回 undefined', () => {
  assert.equal(resolveMember('不存在的动物'), undefined);
});
