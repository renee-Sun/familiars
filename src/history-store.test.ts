import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStore } from './history-store.js';

test('HistoryStore append/getAll/clear 并持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'history.json');
  const store = new HistoryStore(file);

  assert.deepEqual(store.getAll(), []);

  store.append({ role: 'user', target: '@all', text: '你好' });
  store.append({ role: 'agent', member: 'deepseek', name: '福多多', animal: '英国长毛猫', text: '你好呀' });
  assert.equal(store.getAll().length, 2);

  const onDisk = JSON.parse(readFileSync(file, 'utf8')) as unknown[];
  assert.equal(onDisk.length, 2);

  store.clear();
  assert.deepEqual(store.getAll(), []);

  rmSync(dir, { recursive: true, force: true });
});

test('HistoryStore 从已有文件加载', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'history.json');
  const first = new HistoryStore(file);
  first.append({ role: 'user', target: '@福多多', text: 'hi' });

  const second = new HistoryStore(file);
  assert.equal(second.getAll().length, 1);

  rmSync(dir, { recursive: true, force: true });
});
