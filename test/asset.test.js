import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, mimeOf } from '../lib/asset.js';

function withSource(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mlv-asset-')));
  const dir = join(root, 'source');
  mkdirSync(join(dir, 'docs', 'sub'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'sub', 'a.png'), 'png');
  writeFileSync(join(dir, 'docs', 'sub', 'b.SVG'), 'svg');
  writeFileSync(join(dir, 'docs', 'sub', 'note.md'), '# n');
  writeFileSync(join(dir, 'docs', 'sub', 'secret.env'), 'x');
  writeFileSync(join(dir, '.git', 'x.png'), 'x');
  writeFileSync(join(dir, 'skip.png'), 'x');
  writeFileSync(join(root, 'outside.png'), 'x');
  symlinkSync(join(root, 'outside.png'), join(dir, 'docs', 'link.png'));
  // ソース内でも、除外対象や配信対象外を指すシンボリックリンク
  symlinkSync(join(dir, '.git', 'x.png'), join(dir, 'docs', 'to-git.png'));
  symlinkSync(join(dir, 'docs', 'sub', 'note.md'), join(dir, 'docs', 'to-md.png'));
  symlinkSync(join(dir, '.git'), join(dir, 'docs', 'gitdir'));
  const opts = { excludedDirs: new Set(['.git']), excludedFiles: new Set(['skip.png']) };
  try {
    fn(dir, opts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('ソース内の既知の拡張子のファイルを返す', () => {
  withSource((dir, opts) => {
    assert.equal(resolveAsset(dir, '/docs/sub/a.png', opts), join(dir, 'docs', 'sub', 'a.png'));
    assert.equal(resolveAsset(dir, '/docs/sub/b.SVG', opts), join(dir, 'docs', 'sub', 'b.SVG'));
  });
});

test('存在しない・ディレクトリ・Markdown・未知の拡張子は null', () => {
  withSource((dir, opts) => {
    assert.equal(resolveAsset(dir, '/docs/sub/none.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/sub/', opts), null);
    assert.equal(resolveAsset(dir, '/docs/sub/note.md', opts), null);
    assert.equal(resolveAsset(dir, '/docs/sub/secret.env', opts), null);
  });
});

test('ソースの外へは出られない（.. とシンボリックリンク）', () => {
  withSource((dir, opts) => {
    assert.equal(resolveAsset(dir, '/../outside.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/../../outside.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/link.png', opts), null);
  });
});

test('除外ディレクトリ・除外ファイルは返さない', () => {
  withSource((dir, opts) => {
    assert.equal(resolveAsset(dir, '/.git/x.png', opts), null);
    assert.equal(resolveAsset(dir, '/skip.png', opts), null);
    // 余分な . セグメントで判定をすり抜けない
    assert.equal(resolveAsset(dir, '/./skip.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/./../skip.png', opts), null);
  });
});

test('判定はシンボリックリンクを解決した先で行う', () => {
  withSource((dir, opts) => {
    assert.equal(resolveAsset(dir, '/docs/to-git.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/to-md.png', opts), null);
    assert.equal(resolveAsset(dir, '/docs/gitdir/x.png', opts), null);
  });
});

test('mimeOf は拡張子を大文字小文字無視で引く', () => {
  assert.equal(mimeOf('/a/B.PNG'), 'image/png');
  assert.equal(mimeOf('/a/b.svg'), 'image/svg+xml');
  assert.equal(mimeOf('/a/b.md'), null);
});
