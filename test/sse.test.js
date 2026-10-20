import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addClient, broadcast, missedSince, helloChunk, lastIdOf, currentId, BOOT_ID } from '../lib/sse.js';
import { state } from '../lib/state.js';

function collect() {
  const chunks = [];
  const remove = addClient({ write: (c) => chunks.push(c) });
  return { chunks, remove };
}

const idOf = (chunk) => /^id: (.+)$/m.exec(chunk)[1];

beforeEach(() => state.sseClients.clear());

test('broadcast はイベントに id を付けて全クライアントに送る', () => {
  const a = collect();
  const b = collect();
  broadcast('reload', { scope: '/x/' });
  assert.equal(a.chunks.length, 1);
  assert.deepEqual(a.chunks, b.chunks);
  assert.match(a.chunks[0], new RegExp(`^id: ${BOOT_ID}-\\d+\\nevent: reload\\ndata: {"scope":"/x/"}\\n\\n$`));
});

test('missedSince は指定した id より後のイベントだけを返す', () => {
  const { chunks } = collect();
  broadcast('reload', { scope: '/a/' });
  broadcast('rich', { scope: '/b/' });
  broadcast('reload', { scope: '/c/' });
  assert.deepEqual(missedSince(idOf(chunks[0])), chunks.slice(1));
  assert.deepEqual(missedSince(idOf(chunks[2])), []);
});

test('id の指定が無ければ何も返さない（初回の接続）', () => {
  collect();
  broadcast('reload', { scope: '/a/' });
  assert.deepEqual(missedSince(''), []);
  assert.deepEqual(missedSince(undefined), []);
});

test('サーバ再起動前の id や古すぎる id なら、全ページの再読み込みを返す', () => {
  const { chunks } = collect();
  broadcast('reload', { scope: '/a/' });
  const reloadAll = 'event: reload\ndata: {"scope":"all"}\n\n';
  // 起動ごとに BOOT_ID が変わるので、別の起動の id は取りこぼしを判定できない
  assert.deepEqual(missedSince('other-boot-1'), [reloadAll]);
  assert.deepEqual(missedSince('garbage'), [reloadAll]);
  // 保持している件数を超えて流れたら、最初の id は古すぎる
  const oldest = idOf(chunks[0]);
  for (let i = 0; i < 300; i++) broadcast('rich', { scope: '/r/' });
  assert.deepEqual(missedSince(oldest), [reloadAll]);
});

test('接続時の hello は今の位置を id で知らせ、その id からの取りこぼしは無い', () => {
  collect();
  broadcast('reload', { scope: '/a/' });
  const hello = helloChunk();
  assert.match(hello, /^id: [0-9a-f]+-\d+\nevent: hello\ndata: {}\n\n$/);
  assert.deepEqual(missedSince(idOf(hello)), []);
  broadcast('reload', { scope: '/b/' });
  assert.equal(missedSince(idOf(hello)).length, 1);
});

test('自動再接続の Last-Event-ID ヘッダは、URL に残った古い ?since= より優先する', () => {
  // EventSource は自動再接続でも最初の URL（?since= 付き）を使い、最新の id はヘッダで送る
  assert.equal(lastIdOf({ since: 'b-5', header: 'b-20' }), 'b-20');
  assert.equal(lastIdOf({ since: 'b-5', header: undefined }), 'b-5');
  assert.equal(lastIdOf({ since: undefined, header: undefined }), '');
});

test('currentId は hello と同じ今の位置を返し、そこからの取りこぼしは無い', () => {
  collect();
  broadcast('reload', { scope: '/a/' });
  assert.equal(currentId(), idOf(helloChunk()));
  assert.deepEqual(missedSince(currentId()), []);
});
