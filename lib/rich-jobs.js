// リッチ HTML 生成ジョブの状態管理。生成は CLI / ローカル LLM を重く使うため 1 件ずつ実行し、
// 同じページの二重依頼はまとめる。状態は idle / queued / running / error のいずれか
import { createSerialQueue } from './serial.js';

export function createRichJobs({ onSettled = () => {} } = {}) {
  const queue = createSerialQueue();
  const states = new Map();
  let tail = Promise.resolve();

  function status(key) {
    return states.get(key) || { state: 'idle' };
  }

  function request(key, task) {
    const current = status(key).state;
    if (current === 'queued' || current === 'running') return status(key);

    const busy = [...states.values()].some((s) => s.state === 'queued' || s.state === 'running');
    states.set(key, { state: busy ? 'queued' : 'running' });
    tail = queue(async () => {
      states.set(key, { state: 'running' });
      try {
        await task();
        states.delete(key);
        onSettled(key, { state: 'done' });
      } catch (err) {
        const s = { state: 'error', error: err?.message ?? String(err) };
        states.set(key, s);
        onSettled(key, s);
      }
    });
    return status(key);
  }

  // テスト用。依頼済みのジョブがすべて終わるまで待つ
  function whenIdle() {
    return tail;
  }

  return { status, request, whenIdle };
}
