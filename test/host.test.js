import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBindHost, formatServerUrl, isAllowedRequest } from '../lib/host.js';

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

const LOOP = '127.0.0.1';

test('ループバック待受では localhost 系の Host だけを受け付ける（DNS リバインディング対策）', () => {
  for (const host of ['127.0.0.1:7777', 'localhost:7777', '[::1]:7777', 'localhost', 'LOCALHOST:7777']) {
    assert.equal(isAllowedRequest({ host }, LOOP), true, host);
  }
  for (const host of ['evil.example:7777', 'evil.example', '', undefined, '127.0.0.1.evil.example:7777']) {
    assert.equal(isAllowedRequest({ host }, LOOP), false, String(host));
  }
});

test('Origin が付いていれば Host と同一でなければ拒否する（CSRF 対策）', () => {
  const host = '127.0.0.1:7777';
  assert.equal(isAllowedRequest({ host, origin: 'http://127.0.0.1:7777' }, LOOP), true);
  assert.equal(isAllowedRequest({ host, origin: 'http://evil.example' }, LOOP), false);
  assert.equal(isAllowedRequest({ host, origin: 'http://localhost:7777' }, LOOP), false);
  assert.equal(isAllowedRequest({ host, origin: 'null' }, LOOP), false);
});

test('MLV_HOST で LAN に公開しているときは Host を問わない（Origin の検証は行う）', () => {
  assert.equal(isAllowedRequest({ host: '192.168.0.10:7777' }, '0.0.0.0'), true);
  assert.equal(isAllowedRequest({ host: 'mymac.local:7777', origin: 'http://mymac.local:7777' }, '0.0.0.0'), true);
  assert.equal(isAllowedRequest({ host: 'mymac.local:7777', origin: 'http://evil.example' }, '0.0.0.0'), false);
});

test('ループバックの別表記で待ち受けていても Host を検証する', () => {
  for (const bind of ['127.0.0.2', 'LOCALHOST', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1', '[::1]']) {
    assert.equal(isAllowedRequest({ host: 'evil.example:7777' }, bind), false, bind);
  }
});

test('Origin はスキームと既定ポートの表記揺れも考慮して比較する', () => {
  assert.equal(isAllowedRequest({ host: '127.0.0.1:7777', origin: 'https://127.0.0.1:7777' }, LOOP), false);
  assert.equal(isAllowedRequest({ host: 'localhost:80', origin: 'http://localhost' }, LOOP), true);
  assert.equal(isAllowedRequest({ host: 'localhost', origin: 'http://localhost:80' }, LOOP), true);
});

test('角括弧付きの IPv6 待受アドレスを二重に囲まない', () => {
  assert.equal(formatServerUrl('[::1]', 7777), 'http://[::1]:7777/');
});
