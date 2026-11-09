import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSources } from '../lib/config.js';

const A = { slug: 'a', label: 'A', path: '/a' };
const B = { slug: 'b', label: 'B', path: '/b' };

test('sources を読む', () => {
  assert.deepEqual(readSources({ sources: [A] }), { sources: [A], legacy: false });
});

test('旧キー vaults も読めるが、legacy として知らせる', () => {
  assert.deepEqual(readSources({ vaults: [A] }), { sources: [A], legacy: true });
});

test('両方あれば sources を優先する', () => {
  assert.deepEqual(readSources({ sources: [A], vaults: [B] }), { sources: [A], legacy: false });
});

test('どちらも配列でなければ空', () => {
  assert.deepEqual(readSources({}), { sources: [], legacy: false });
  assert.deepEqual(readSources({ sources: 'x' }), { sources: [], legacy: false });
  assert.deepEqual(readSources(null), { sources: [], legacy: false });
});
