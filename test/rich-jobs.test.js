import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRichJobs } from '../lib/rich-jobs.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('依頼前は idle', () => {
  const jobs = createRichJobs();
  assert.deepEqual(jobs.status('k'), { state: 'idle' });
});

test('実行中は running、成功すると idle に戻り onSettled に done を通知する', async () => {
  const settled = [];
  const jobs = createRichJobs({ onSettled: (key, s) => settled.push([key, s]) });
  const d = deferred();
  assert.deepEqual(jobs.request('k', () => d.promise), { state: 'running' });
  assert.deepEqual(jobs.status('k'), { state: 'running' });
  d.resolve();
  await jobs.whenIdle();
  assert.deepEqual(jobs.status('k'), { state: 'idle' });
  assert.deepEqual(settled, [['k', { state: 'done' }]]);
});

test('失敗すると error とメッセージを保持し、onSettled に通知する', async () => {
  const settled = [];
  const jobs = createRichJobs({ onSettled: (key, s) => settled.push([key, s]) });
  jobs.request('k', async () => { throw new Error('spawn claude ENOENT'); });
  await jobs.whenIdle();
  assert.deepEqual(jobs.status('k'), { state: 'error', error: 'spawn claude ENOENT' });
  assert.deepEqual(settled, [['k', { state: 'error', error: 'spawn claude ENOENT' }]]);
});

test('同じキーの実行中・待機中に再依頼してもタスクを重複実行しない', async () => {
  const jobs = createRichJobs();
  const d = deferred();
  let calls = 0;
  const task = () => { calls++; return d.promise; };
  jobs.request('k', task);
  assert.deepEqual(jobs.request('k', task), { state: 'running' });
  d.resolve();
  await jobs.whenIdle();
  assert.equal(calls, 1);
});

test('別のキーは 1 件ずつ順番に実行し、後続は queued になる', async () => {
  const jobs = createRichJobs();
  const d1 = deferred();
  const order = [];
  jobs.request('a', async () => { order.push('a:start'); await d1.promise; order.push('a:end'); });
  assert.deepEqual(jobs.request('b', async () => { order.push('b'); }), { state: 'queued' });
  assert.deepEqual(jobs.status('b'), { state: 'queued' });
  d1.resolve();
  await jobs.whenIdle();
  assert.deepEqual(order, ['a:start', 'a:end', 'b']);
});

test('失敗したキーは再依頼で再実行できる', async () => {
  const jobs = createRichJobs();
  jobs.request('k', async () => { throw new Error('x'); });
  await jobs.whenIdle();
  let ran = false;
  jobs.request('k', async () => { ran = true; });
  await jobs.whenIdle();
  assert.equal(ran, true);
  assert.deepEqual(jobs.status('k'), { state: 'idle' });
});
