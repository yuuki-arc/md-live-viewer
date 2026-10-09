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

test('load() は特殊なファイル名を含む vault でも初回走査を完了する', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { load, stop } = await import('../lib/indexer.js');
  const { state, resetState } = await import('../lib/state.js');

  const vault = mkdtempSync(join(tmpdir(), 'mlv-indexer-'));
  mkdirSync(join(vault, 'sub'));
  writeFileSync(join(vault, '50% off.md'), '# a\n');
  writeFileSync(join(vault, 'sub', 'README.MD'), '# b\n');
  writeFileSync(join(vault, 'img.png'), '');
  try {
    resetState();
    await load(vault);
    assert.deepEqual([...state.index.keys()].sort(), ['/50% off/', '/sub/README/']);
  } finally {
    await stop();
    resetState();
    rmSync(vault, { recursive: true, force: true });
  }
});
