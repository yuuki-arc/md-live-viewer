import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, mimeOf } from '../lib/asset.js';

function withVault(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mlv-asset-')));
  const vault = join(root, 'vault');
  mkdirSync(join(vault, 'docs', 'sub'), { recursive: true });
  mkdirSync(join(vault, '.git'), { recursive: true });
  writeFileSync(join(vault, 'docs', 'sub', 'a.png'), 'png');
  writeFileSync(join(vault, 'docs', 'sub', 'b.SVG'), 'svg');
  writeFileSync(join(vault, 'docs', 'sub', 'note.md'), '# n');
  writeFileSync(join(vault, 'docs', 'sub', 'secret.env'), 'x');
  writeFileSync(join(vault, '.git', 'x.png'), 'x');
  writeFileSync(join(vault, 'skip.png'), 'x');
  writeFileSync(join(root, 'outside.png'), 'x');
  symlinkSync(join(root, 'outside.png'), join(vault, 'docs', 'link.png'));
  // vault 内でも、除外対象や配信対象外を指すシンボリックリンク
  symlinkSync(join(vault, '.git', 'x.png'), join(vault, 'docs', 'to-git.png'));
  symlinkSync(join(vault, 'docs', 'sub', 'note.md'), join(vault, 'docs', 'to-md.png'));
  symlinkSync(join(vault, '.git'), join(vault, 'docs', 'gitdir'));
  const opts = { excludedDirs: new Set(['.git']), excludedFiles: new Set(['skip.png']) };
  try {
    fn(vault, opts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('vault 内の既知の拡張子のファイルを返す', () => {
  withVault((vault, opts) => {
    assert.equal(resolveAsset(vault, '/docs/sub/a.png', opts), join(vault, 'docs', 'sub', 'a.png'));
    assert.equal(resolveAsset(vault, '/docs/sub/b.SVG', opts), join(vault, 'docs', 'sub', 'b.SVG'));
  });
});

test('存在しない・ディレクトリ・Markdown・未知の拡張子は null', () => {
  withVault((vault, opts) => {
    assert.equal(resolveAsset(vault, '/docs/sub/none.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/sub/', opts), null);
    assert.equal(resolveAsset(vault, '/docs/sub/note.md', opts), null);
    assert.equal(resolveAsset(vault, '/docs/sub/secret.env', opts), null);
  });
});

test('vault の外へは出られない（.. とシンボリックリンク）', () => {
  withVault((vault, opts) => {
    assert.equal(resolveAsset(vault, '/../outside.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/../../outside.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/link.png', opts), null);
  });
});

test('除外ディレクトリ・除外ファイルは返さない', () => {
  withVault((vault, opts) => {
    assert.equal(resolveAsset(vault, '/.git/x.png', opts), null);
    assert.equal(resolveAsset(vault, '/skip.png', opts), null);
    // 余分な . セグメントで判定をすり抜けない
    assert.equal(resolveAsset(vault, '/./skip.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/./../skip.png', opts), null);
  });
});

test('判定はシンボリックリンクを解決した先で行う', () => {
  withVault((vault, opts) => {
    assert.equal(resolveAsset(vault, '/docs/to-git.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/to-md.png', opts), null);
    assert.equal(resolveAsset(vault, '/docs/gitdir/x.png', opts), null);
  });
});

test('mimeOf は拡張子を大文字小文字無視で引く', () => {
  assert.equal(mimeOf('/a/B.PNG'), 'image/png');
  assert.equal(mimeOf('/a/b.svg'), 'image/svg+xml');
  assert.equal(mimeOf('/a/b.md'), null);
});
