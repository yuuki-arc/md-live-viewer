import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRichStore, hashSource, richFilePath } from '../lib/rich-cache.js';

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mlv-rich-'));
  try {
    return fn(createRichStore(path.join(dir, 'cache')), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const META = { url: '/a/', sourceHash: 'h1', generatedAt: '2026-10-20T00:00:00.000Z', generator: 'claude' };

test('hashSource は内容が同じなら同じ値、違えば違う値を返す', () => {
  assert.equal(hashSource('# a'), hashSource('# a'));
  assert.notEqual(hashSource('# a'), hashSource('# b'));
});

test('未生成のページは null を返す', () => {
  withStore((store) => {
    assert.equal(store.read('notes', '/a/'), null);
  });
});

test('書き込んだ HTML とメタ情報を読み戻せる（キャッシュディレクトリは自動作成）', () => {
  withStore((store) => {
    store.write('notes', '/a/', { html: '<p>A</p>', meta: META });
    assert.deepEqual(store.read('notes', '/a/'), { html: '<p>A</p>', meta: META });
  });
});

test('直接開けるよう、ページのパスに沿った index.html に置く', () => {
  const root = '/c';
  assert.equal(richFilePath(root, 'notes', '/'), path.join(root, 'notes', 'index.html'));
  assert.equal(richFilePath(root, 'notes', '/a/b/'), path.join(root, 'notes', 'a', 'b', 'index.html'));
  assert.equal(richFilePath(root, 'notes', '/メモ/日報/'), path.join(root, 'notes', 'メモ', '日報', 'index.html'));
  withStore((store, dir) => {
    store.write('notes', '/a/b/', { html: '<p>B</p>', meta: { ...META, url: '/a/b/' } });
    const file = path.join(dir, 'cache', 'notes', 'a', 'b', 'index.html');
    // ファイルの先頭は生成 HTML そのもので、ブラウザでそのまま開ける
    assert.ok(readFileSync(file, 'utf8').startsWith('<p>B</p>'));
  });
});

test('メタ情報は HTML 末尾の JSON に埋め込み、読み出し時は取り除く', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: '<p>A</p>', meta: { ...META, url: '/a/</script><b>' } });
    const raw = readFileSync(path.join(dir, 'cache', 'notes', 'a', 'index.html'), 'utf8');
    assert.match(raw, /<script type="application\/json" id="mlv-meta">/);
    // URL に </script> を含んでも埋め込みが壊れない
    assert.equal((raw.match(/<\/script>/g) || []).length, 1);
    const got = store.read('notes', '/a/');
    assert.equal(got.html, '<p>A</p>');
    assert.equal(got.meta.url, '/a/</script><b>');
  });
});

test('vault（slug）が違えば同じページ URL でも別のキャッシュになる', () => {
  withStore((store) => {
    store.write('notes', '/a/', { html: 'notes', meta: META });
    store.write('work', '/a/', { html: 'work', meta: META });
    assert.equal(store.read('notes', '/a/').html, 'notes');
    assert.equal(store.read('work', '/a/').html, 'work');
  });
});

test('. や .. のセグメントはエスケープし、キャッシュディレクトリの外に出ない', () => {
  const root = path.resolve('/c');
  for (const [slug, url] of [['..', '/x/'], ['notes', '/../../etc/'], ['notes', '/./a/'], ['a\\b', '/c\\..\\d/']]) {
    const file = richFilePath(root, slug, url);
    assert.ok(file.startsWith(root + path.sep), `${slug} ${url} -> ${file}`);
    assert.ok(!file.split(path.sep).includes('..'));
  }
  withStore((store, dir) => {
    store.write('../x', '/../メモ/', { html: 'x', meta: META });
    assert.deepEqual(readdirSync(dir), ['cache']);
    assert.equal(store.read('../x', '/../メモ/').html, 'x');
  });
});

test('エスケープしても別のページと同じファイルにならない', () => {
  const root = '/c';
  const urls = ['/../', '/%2E%2E/', '/index.html/', '/a//', '/a/'];
  const files = urls.map((u) => richFilePath(root, 'notes', u));
  assert.equal(new Set(files).size, urls.length);
  // ページ /a/ の index.html と、ページ /a/index.html/ のディレクトリがぶつからない
  assert.notEqual(path.dirname(richFilePath(root, 'notes', '/a/index.html/')), richFilePath(root, 'notes', '/a/'));
});

test('上書きすると新しい内容に置き換わり、一時ファイルが残らない', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: 'old', meta: { ...META, sourceHash: '1' } });
    store.write('notes', '/a/', { html: 'new', meta: { ...META, sourceHash: '2' } });
    assert.equal(store.read('notes', '/a/').html, 'new');
    assert.equal(store.read('notes', '/a/').meta.sourceHash, '2');
    assert.deepEqual(readdirSync(path.join(dir, 'cache', 'notes', 'a')), ['index.html']);
  });
});

test('メタ情報の埋め込みが無い HTML（手で置いたファイルなど）は未生成として扱う', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: 'A', meta: META });
    const file = path.join(dir, 'cache', 'notes', 'a', 'index.html');
    writeFileSync(file, '<p>hand written</p>');
    assert.equal(store.read('notes', '/a/'), null);
    assert.ok(existsSync(file));
  });
});
