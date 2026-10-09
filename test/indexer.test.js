import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarkdown } from '../lib/indexer.js';

test('拡張子 .md は大文字小文字を区別せず Markdown として扱う', () => {
  assert.equal(isMarkdown('/v/a.md'), true);
  assert.equal(isMarkdown('/v/README.MD'), true);
  assert.equal(isMarkdown('/v/Note.Md'), true);
});

test('.md 以外は対象外', () => {
  assert.equal(isMarkdown('/v/a.markdown'), false);
  assert.equal(isMarkdown('/v/a.md.bak'), false);
  assert.equal(isMarkdown('/v/img.png'), false);
});
