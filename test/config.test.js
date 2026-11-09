import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSources } from '../lib/config.js';

const A = { slug: 'a', label: 'A', path: '/a' };
const B = { slug: 'b', label: 'B', path: '/b' };

test('sources を読む', () => {
  assert.deepEqual(readSources({ sources: [A] }), [A]);
});

// Obsidian の vault を並べるなら vaults と書くのが自然なので、正式な別名として受け付ける
test('別名 vaults も同じように読む', () => {
  assert.deepEqual(readSources({ vaults: [A] }), [A]);
});

test('両方あれば sources を優先する', () => {
  assert.deepEqual(readSources({ sources: [A], vaults: [B] }), [A]);
});

test('どちらも配列でなければ空', () => {
  assert.deepEqual(readSources({}), []);
  assert.deepEqual(readSources({ sources: 'x' }), []);
  assert.deepEqual(readSources(null), []);
});
