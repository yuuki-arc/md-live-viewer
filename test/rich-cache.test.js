import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRichStore, hashSource } from '../lib/rich-cache.js';

function withStore(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mlv-rich-'));
  try {
    return fn(createRichStore(path.join(dir, 'cache')), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
    const meta = { url: '/a/', sourceHash: 'h1', generatedAt: '2026-10-20T00:00:00.000Z', generator: 'claude' };
    store.write('notes', '/a/', { html: '<p>A</p>', meta });
    assert.deepEqual(store.read('notes', '/a/'), { html: '<p>A</p>', meta });
  });
});

test('vault（slug）が違えば同じページ URL でも別のキャッシュになる', () => {
  withStore((store) => {
    const meta = { url: '/a/', sourceHash: 'h', generatedAt: 't', generator: 'g' };
    store.write('notes', '/a/', { html: 'notes', meta });
    store.write('work', '/a/', { html: 'work', meta });
    assert.equal(store.read('notes', '/a/').html, 'notes');
    assert.equal(store.read('work', '/a/').html, 'work');
  });
});

test('ファイル名はハッシュなので、パスに ../ や日本語を含んでもキャッシュディレクトリの外に出ない', () => {
  withStore((store, dir) => {
    const meta = { url: '/../メモ/', sourceHash: 'h', generatedAt: 't', generator: 'g' };
    store.write('../x', '/../メモ/', { html: 'x', meta });
    assert.deepEqual(readdirSync(dir), ['cache']);
    for (const name of readdirSync(path.join(dir, 'cache'))) {
      assert.match(name, /^[0-9a-f]{64}\.json$/);
    }
  });
});

test('上書きすると新しい内容に置き換わり、一時ファイルが残らない', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: 'old', meta: { url: '/a/', sourceHash: '1', generatedAt: 't', generator: 'g' } });
    store.write('notes', '/a/', { html: 'new', meta: { url: '/a/', sourceHash: '2', generatedAt: 't', generator: 'g' } });
    assert.equal(store.read('notes', '/a/').html, 'new');
    assert.equal(store.read('notes', '/a/').meta.sourceHash, '2');
    assert.equal(readdirSync(path.join(dir, 'cache')).length, 1);
  });
});

test('HTML とメタ情報は 1 ファイルにまとめ、読み出しで新旧が混ざらない', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: 'A', meta: { url: '/a/', sourceHash: 'h', generatedAt: 't', generator: 'g' } });
    assert.equal(readdirSync(path.join(dir, 'cache')).length, 1);
  });
});

test('HTML を含まない旧形式（メタ情報だけ）のファイルは未生成として扱う', () => {
  withStore((store, dir) => {
    store.write('notes', '/a/', { html: 'A', meta: { url: '/a/', sourceHash: 'h', generatedAt: 't', generator: 'g' } });
    const [name] = readdirSync(path.join(dir, 'cache'));
    writeFileSync(path.join(dir, 'cache', name), JSON.stringify({ url: '/a/', sourceHash: 'h' }));
    assert.equal(store.read('notes', '/a/'), null);
  });
});
