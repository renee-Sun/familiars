import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './memory-store.js';

test('MemoryStore append/getAll/clear', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const store = new MemoryStore(join(dir, 'memory.json'));

  assert.equal(store.getAll().length, 0);
  store.append('lesson', 'pnpm build 脚本要 allowBuilds 放行');
  store.append('decision', 'Hedwig 换 DeepSeek Flash');
  assert.equal(store.getAll().length, 2);
  assert.equal(store.getAll()[0]!.type, 'lesson');

  store.clear();
  assert.equal(store.getAll().length, 0);

  rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore 从已有文件加载', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'memory.json');
  const first = new MemoryStore(file);
  first.append('fact', '项目在 localhost:3210 运行');

  const second = new MemoryStore(file);
  assert.equal(second.getAll().length, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore 存向量 / 补向量 / 查未向量化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  const file = join(dir, 'memory.json');
  const store = new MemoryStore(file);

  const withVec = store.append('fact', '项目在 localhost:3210 运行', [1, 0, 0]);
  const noVec = store.append('fact', '配色用暖橙');

  assert.deepEqual(withVec.vector, [1, 0, 0]);
  assert.deepEqual(store.getUnvectorized().map((m) => m.id), [noVec.id]);

  store.setVector(noVec.id, [0, 1, 0]);
  assert.deepEqual(store.getAll().find((m) => m.id === noVec.id)?.vector, [0, 1, 0]);
  assert.deepEqual(store.getUnvectorized(), []);

  // 落盘后重载，向量还在
  const reloaded = new MemoryStore(file);
  assert.deepEqual(reloaded.getAll().find((m) => m.id === noVec.id)?.vector, [0, 1, 0]);

  rmSync(dir, { recursive: true, force: true });
});
