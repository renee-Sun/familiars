import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './session-store.js';

test('SessionStore set/get/delete 并持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'sessions.json');
  const store = new SessionStore(file);

  assert.equal(store.get('deepseek'), undefined);
  store.set('deepseek', 'sid-1');
  assert.equal(store.get('deepseek'), 'sid-1');

  const onDisk = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  assert.equal(onDisk['deepseek'], 'sid-1');

  store.delete('deepseek');
  assert.equal(store.get('deepseek'), undefined);

  rmSync(dir, { recursive: true, force: true });
});

test('SessionStore 从已有文件加载', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'sessions.json');
  const first = new SessionStore(file);
  first.set('glm', 'sid-glm');

  const second = new SessionStore(file);
  assert.equal(second.get('glm'), 'sid-glm');

  rmSync(dir, { recursive: true, force: true });
});
