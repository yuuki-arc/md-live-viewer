import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDoc } from '../lib/search.js';

test('index のキー（未エンコードのパス）から name と path を作る', () => {
  assert.deepEqual(buildDoc('/a/b/c/'), { url: '/a/b/c/', name: 'c', path: 'a/b/c' });
});

test('ファイル名に % を含んでも例外にならず、そのままの名前で登録される', () => {
  assert.deepEqual(buildDoc('/50% off/'), { url: '/50% off/', name: '50% off', path: '50% off' });
});

test('%XX 形式に見えるファイル名をデコードしない', () => {
  assert.deepEqual(buildDoc('/a%20b/'), { url: '/a%20b/', name: 'a%20b', path: 'a%20b' });
});
