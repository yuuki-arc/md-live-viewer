import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBindHost, formatServerUrl } from '../lib/host.js';

test('MLV_HOST が無ければループバックで待ち受ける', () => {
  assert.equal(resolveBindHost({}), '127.0.0.1');
});

test('MLV_HOST で待受アドレスを指定できる', () => {
  assert.equal(resolveBindHost({ MLV_HOST: '0.0.0.0' }), '0.0.0.0');
});

test('汎用の HOST 環境変数は無視する（シェルがホスト名を入れていることがある）', () => {
  assert.equal(resolveBindHost({ HOST: 'MacBook.local' }), '127.0.0.1');
});

test('ログ用 URL は IPv6 アドレスを角括弧で囲む', () => {
  assert.equal(formatServerUrl('127.0.0.1', 7777), 'http://127.0.0.1:7777/');
  assert.equal(formatServerUrl('::', 7777), 'http://[::]:7777/');
  assert.equal(formatServerUrl('::1', 7777), 'http://[::1]:7777/');
});
