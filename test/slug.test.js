import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../assets/js/slug.js';

test('小文字化し、空白を - にする', () => {
  assert.equal(slugify('My Heading'), 'my-heading');
  assert.equal(slugify('  a   b  '), 'a-b');
});

test('文字・数字・- _ 以外は取り除き、日本語は残す', () => {
  assert.equal(slugify('A.B: c'), 'ab-c');
  assert.equal(slugify('見出し（その1）'), '見出しその1');
});

test('記号だけなら空文字', () => {
  assert.equal(slugify('!!!'), '');
});
