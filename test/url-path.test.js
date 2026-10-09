import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePath, decodePath, pageKey } from '../assets/js/url-path.js';

test('encodePath はセグメントごとにエンコードし、区切りの / は残す', () => {
  assert.equal(encodePath('/a/b/c/'), '/a/b/c/');
  assert.equal(encodePath('/メモ/'), '/%E3%83%A1%E3%83%A2/');
  assert.equal(encodePath('/a b/'), '/a%20b/');
});

test('encodePath はファイル名中の予約文字（& # ? %）もエンコードする', () => {
  assert.equal(encodePath('/Q&A/'), '/Q%26A/');
  assert.equal(encodePath('/C#/'), '/C%23/');
  assert.equal(encodePath('/what?/'), '/what%3F/');
  assert.equal(encodePath('/50% off/'), '/50%25%20off/');
});

test('decodePath は encodePath の逆変換になる', () => {
  for (const p of ['/a/b/c/', '/メモ/', '/Q&A/', '/C#/', '/50% off/', '/dir/a b']) {
    assert.equal(decodePath(encodePath(p)), p);
  }
});

test('decodePath は不正なエスケープなら null を返す', () => {
  assert.equal(decodePath('/%E3%83/'), null);
  assert.equal(decodePath('/50%/'), null);
});

test('pageKey は location.pathname を index のキー形式（デコード済み・末尾 /）に揃える', () => {
  // SSE の reload イベントの scope はこの形式で届く
  assert.equal(pageKey('/%E3%83%A1%E3%83%A2/'), '/メモ/');
  assert.equal(pageKey('/a/b'), '/a/b/');
  assert.equal(pageKey('/special/Q%26A/'), '/special/Q&A/');
});

test('pageKey は不正なエスケープなら null を返す', () => {
  assert.equal(pageKey('/%E3%83/'), null);
});
