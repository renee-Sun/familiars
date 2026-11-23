import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './memory-store.js';

function makeStore(): { store: MemoryStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'familiars-'));
  return { store: new MemoryStore(join(dir, 'memory.db')), dir };
}

test('MemoryStore append/getAll/clear', () => {
  const { store, dir } = makeStore();
  assert.equal(store.getAll().length, 0);
  store.append('lesson', 'pnpm build 脚本要 allowBuilds 放行');
  store.append('decision', 'Hedwig 换 DeepSeek Flash');
  assert.equal(store.getAll().length, 2);
  assert.equal(store.getAll()[0]!.type, 'lesson');

  store.clear();
  assert.equal(store.getAll().length, 0);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore 从已有文件加载（跨实例持久化）', () => {
  const { store, dir } = makeStore();
  store.append('fact', '项目在 localhost:3210 运行');
  store.close();

  const second = new MemoryStore(join(dir, 'memory.db'));
  assert.equal(second.getAll().length, 1);
  second.close();
  rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore 存向量 / 补向量 / 查未向量化', () => {
  const { store, dir } = makeStore();
  const withVec = store.append('fact', '项目在 localhost:3210 运行', [1, 0, 0]);
  const noVec = store.append('fact', '配色用暖橙');

  assert.deepEqual(withVec.vector, [1, 0, 0]);
  assert.deepEqual(store.getUnvectorized().map((m) => m.id), [noVec.id]);

  store.setVector(noVec.id, [0, 1, 0]);
  assert.deepEqual(store.getUnvectorized(), []);

  // 落盘后重载，向量还在（Float32 往返，容差内）
  store.close();
  const reloaded = new MemoryStore(join(dir, 'memory.db'));
  const restored = reloaded.getAll().find((m) => m.id === noVec.id)?.vector ?? [];
  assert.equal(restored.length, 3);
  assert.ok(Math.abs(restored[1]! - 1) < 1e-6);
  reloaded.close();
  rmSync(dir, { recursive: true, force: true });
});

test('keywordSearch：英文走 FTS5、2 字中文走 LIKE 兜底', () => {
  const { store, dir } = makeStore();
  store.append('fact', '部署在哪个端口');
  store.append('fact', 'pnpm build 需要 allowBuilds 放行');
  store.append('fact', '配色用暖橙色');

  // 英文（≥3 字符）→ FTS5 trigram
  assert.deepEqual(store.keywordSearch('allowbuilds', 3).map((m) => m.text), ['pnpm build 需要 allowBuilds 放行']);
  // ≥3 字中文 → FTS5 trigram
  assert.deepEqual(store.keywordSearch('部署在哪个', 3).map((m) => m.text), ['部署在哪个端口']);
  // 2 字中文（trigram 查不到）→ LIKE 兜底
  assert.deepEqual(store.keywordSearch('端口', 3).map((m) => m.text), ['部署在哪个端口']);
  // 无命中
  assert.deepEqual(store.keywordSearch('redis', 3), []);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('semanticSearch：余弦相似度排序 + 阈值过滤', () => {
  const { store, dir } = makeStore();
  store.append('fact', '服务监听 3210', [1, 0, 0]);
  store.append('fact', '配色用暖橙', [0, 1, 0]);

  const r = store.semanticSearch([1, 0, 0], 3, 0.4);
  assert.deepEqual(r.map((m) => m.text), ['服务监听 3210']);
  // 空查询向量 → 不召回
  assert.deepEqual(store.semanticSearch([], 3, 0.4), []);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('hybridSearch：按向量相关性重排（不再关键词优先）', () => {
  const { store, dir } = makeStore();
  store.append('lesson', 'allowbuilds 放行', [0, 1, 0]); // 关键词命中但向量不相关
  store.append('fact', '服务监听 3210', [1, 0, 0]);       // 向量高度相关

  const r = store.hybridSearch('allowbuilds', [1, 0, 0], 3, 0.4);
  // 向量重排后：语义相关的排前面，关键词命中但语义无关的排后面
  assert.deepEqual(r.map((m) => m.text), ['服务监听 3210', 'allowbuilds 放行']);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('hybridSearch：空查询向量退回纯关键词', () => {
  const { store, dir } = makeStore();
  store.append('fact', 'allowbuilds 放行', [0, 1, 0]);
  store.append('fact', '配色用暖橙', [1, 0, 0]);

  const r = store.hybridSearch('allowbuilds', [], 3, 0.4);
  assert.deepEqual(r.map((m) => m.text), ['allowbuilds 放行']);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
