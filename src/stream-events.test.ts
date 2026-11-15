import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractErrorResult,
  extractSessionId,
  extractTextBlocks,
  parseLine,
} from './stream-events.js';

test('extractTextBlocks 只取 text 块、跳过 thinking', () => {
  const evt = {
    type: 'assistant',
    message: {
      content: [
        { type: 'thinking', thinking: '内部推理...' },
        { type: 'text', text: '你好' },
        { type: 'text', text: '世界' },
      ],
    },
  };
  assert.deepEqual(extractTextBlocks(evt), ['你好', '世界']);
});

test('extractTextBlocks 非 assistant 事件返回空数组', () => {
  assert.deepEqual(extractTextBlocks({ type: 'result' }), []);
  assert.deepEqual(extractTextBlocks({ type: 'assistant' }), []);
});

test('extractSessionId 只在 init 事件返回 session_id', () => {
  assert.equal(extractSessionId({ type: 'system', subtype: 'init', session_id: 'abc' }), 'abc');
  assert.equal(extractSessionId({ type: 'system', subtype: 'thinking_tokens' }), undefined);
  assert.equal(extractSessionId({ type: 'assistant', session_id: 'abc' }), undefined);
});

test('extractErrorResult 只在 is_error 的 result 返回', () => {
  assert.equal(extractErrorResult({ type: 'result', is_error: true, result: 'boom' }), 'boom');
  assert.equal(extractErrorResult({ type: 'result', is_error: false, result: 'ok' }), undefined);
  assert.equal(extractErrorResult({ type: 'result', is_error: true }), 'agent 返回错误');
});

test('parseLine 处理空行与非法 JSON', () => {
  assert.deepEqual(parseLine('{"type":"result"}'), { type: 'result' });
  assert.equal(parseLine(''), undefined);
  assert.equal(parseLine('not json'), undefined);
});
