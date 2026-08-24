import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawPathToUrl, toRawHref } from '../lib/raw.js';

test('/_raw/ 配下のパスは接頭辞を剥がしてページ URL に戻す', () => {
  assert.equal(rawPathToUrl('/_raw/a/b/'), '/a/b/');
});

test('末尾スラッシュが無くてもページ URL の形（末尾スラッシュ付き）に正規化する', () => {
  assert.equal(rawPathToUrl('/_raw/a/b'), '/a/b/');
});

test('ルート直下のページも変換できる', () => {
  assert.equal(rawPathToUrl('/_raw/top/'), '/top/');
});

test('接頭辞だけのパスは対象外', () => {
  assert.equal(rawPathToUrl('/_raw/'), null);
  assert.equal(rawPathToUrl('/_raw'), null);
});

test('接頭辞の部分一致は対象外（/_rawdata/ を誤って拾わない）', () => {
  assert.equal(rawPathToUrl('/_rawdata/x/'), null);
});

test('接頭辞を持たない通常ページのパスは対象外', () => {
  assert.equal(rawPathToUrl('/a/b/'), null);
});

test('ページ URL から raw ビューの href を組み立てる', () => {
  assert.equal(toRawHref('/a/b/'), '/_raw/a/b/');
});

test('スペースや日本語を含むセグメントは encodeURIComponent される', () => {
  assert.equal(toRawHref('/メモ/my note/'), '/_raw/%E3%83%A1%E3%83%A2/my%20note/');
});

test('href に属性値を壊す文字が残らない', () => {
  assert.equal(toRawHref('/a"b/'), '/_raw/a%22b/');
});

test('ルートは接頭辞のみを返す', () => {
  assert.equal(toRawHref('/'), '/_raw/');
});
