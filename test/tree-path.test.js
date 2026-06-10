import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorSlugs } from '../assets/js/tree-path.js';

test('ネストしたページは全ての祖先ディレクトリを返す（自身は除く）', () => {
  assert.deepEqual(ancestorSlugs('/a/b/c/'), ['a', 'a/b']);
});

test('末尾スラッシュが無くても同じ結果になる', () => {
  assert.deepEqual(ancestorSlugs('/a/b/c'), ['a', 'a/b']);
});

test('ルート直下のページは展開すべき祖先を持たない', () => {
  assert.deepEqual(ancestorSlugs('/foo/'), []);
  assert.deepEqual(ancestorSlugs('/foo'), []);
});

test('ルート・空文字は空配列', () => {
  assert.deepEqual(ancestorSlugs('/'), []);
  assert.deepEqual(ancestorSlugs(''), []);
});

test('パーセントエンコードされたセグメントはデコードして tree の slug と一致させる', () => {
  // /メモ/sub/note/
  assert.deepEqual(
    ancestorSlugs('/%E3%83%A1%E3%83%A2/sub/note/'),
    ['メモ', 'メモ/sub'],
  );
});

test('連続スラッシュは無視する', () => {
  assert.deepEqual(ancestorSlugs('/a//b/c/'), ['a', 'a/b']);
});
