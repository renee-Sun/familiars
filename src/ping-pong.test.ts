import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSamePair, isSubstantive, predictStreak, SUBSTANTIVE_OUTPUT_LEN } from './ping-pong.js';

test('新对 → count 1，不警告不拦截', () => {
  assert.deepEqual(predictStreak(undefined, 'a', 'b', 50), { warn: false, block: false, count: 1 });
});

test('同一对连续 2 次（无实质）→ 警告', () => {
  const v = predictStreak({ from: 'a', to: 'b', count: 1 }, 'b', 'a', 50);
  assert.equal(v.count, 2);
  assert.equal(v.warn, true);
  assert.equal(v.block, false);
});

test('同一对连续 4 次（无实质）→ 拦截', () => {
  const v = predictStreak({ from: 'a', to: 'b', count: 3 }, 'a', 'b', 50);
  assert.equal(v.count, 4);
  assert.equal(v.block, true);
});

test('同一对但有实质活动（>200字）→ 重置为 1', () => {
  const v = predictStreak({ from: 'a', to: 'b', count: 3 }, 'a', 'b', SUBSTANTIVE_OUTPUT_LEN + 1);
  assert.equal(v.count, 1);
  assert.equal(v.warn, false);
});

test('换了一对 → 重置为 1', () => {
  assert.equal(predictStreak({ from: 'a', to: 'b', count: 3 }, 'a', 'c', 50).count, 1);
});

test('isSamePair 无序', () => {
  const entry = { from: 'a', to: 'b', count: 1 };
  assert.equal(isSamePair(entry, 'a', 'b'), true);
  assert.equal(isSamePair(entry, 'b', 'a'), true);
  assert.equal(isSamePair(entry, 'a', 'c'), false);
});

test('isSubstantive 阈值', () => {
  assert.equal(isSubstantive(200), false);
  assert.equal(isSubstantive(201), true);
});
