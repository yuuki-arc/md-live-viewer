import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSerialQueue } from '../lib/serial.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('後から投入した処理は、先の処理が終わるまで始まらない', async () => {
  const run = createSerialQueue();
  const log = [];
  const a = run(async () => { log.push('a:start'); await tick(20); log.push('a:end'); return 'A'; });
  const b = run(async () => { log.push('b:start'); log.push('b:end'); return 'B'; });
  assert.deepEqual(await Promise.all([a, b]), ['A', 'B']);
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('先の処理が失敗しても後続は実行され、失敗は呼び出し元にだけ伝わる', async () => {
  const run = createSerialQueue();
  const a = run(async () => { throw new Error('boom'); });
  const b = run(async () => 'ok');
  await assert.rejects(a, /boom/);
  assert.equal(await b, 'ok');
});
