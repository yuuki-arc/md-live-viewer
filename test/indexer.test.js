import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMarkdown, load, stop } from '../lib/indexer.js';
import { state, resetState } from '../lib/state.js';

test('拡張子 .md は大文字小文字を区別せず Markdown として扱う', () => {
  assert.equal(isMarkdown('/v/a.md'), true);
  assert.equal(isMarkdown('/v/README.MD'), true);
  assert.equal(isMarkdown('/v/Note.Md'), true);
});

test('.md 以外は対象外', () => {
  assert.equal(isMarkdown('/v/a.markdown'), false);
  assert.equal(isMarkdown('/v/a.md.bak'), false);
  assert.equal(isMarkdown('/v/img.png'), false);
});

// 実ファイルの vault で load() し、終了後に watcher と state を片付ける
async function withVault(files, fn) {
  const vault = mkdtempSync(join(tmpdir(), 'mlv-indexer-'));
  for (const [rel, body] of Object.entries(files)) {
    const parts = rel.split('/');
    if (parts.length > 1) mkdirSync(join(vault, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(vault, rel), body);
  }
  resetState();
  try {
    return await fn(vault);
  } finally {
    await stop();
    resetState();
    rmSync(vault, { recursive: true, force: true });
  }
}

// load() が完了しない不具合をハングではなく失敗として検出するため
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} が ${ms}ms 以内に完了しない`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitFor(cond, ms, label) {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error(`${label} を ${ms}ms 待っても観測できない`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// addOrUpdate の途中（検索インデックス登録）で、指定した URL のときだけ失敗させる
function failSearchIndexAddFor(urls) {
  const original = state.searchIndex.add.bind(state.searchIndex);
  const attempted = [];
  state.searchIndex.add = (doc) => {
    attempted.push(doc.url);
    if (urls.includes(doc.url)) throw new Error('injected failure: ' + doc.url);
    return original(doc);
  };
  return attempted;
}

test('load() は特殊なファイル名を含む vault でも初回走査を完了する', async () => {
  await withVault({ '50% off.md': '# a\n', 'sub/README.MD': '# b\n', 'img.png': '' }, async (vault) => {
    await withTimeout(load(vault), 5000, 'load()');
    assert.deepEqual([...state.index.keys()].sort(), ['/50% off/', '/sub/README/']);
  });
});

test('初回走査で 1 ファイルの反映に失敗しても load() は完了し、他のファイルは登録される', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  await withVault({ 'good.md': '# g\n', 'bad.md': '# b\n' }, async (vault) => {
    failSearchIndexAddFor(['/bad/']);
    await withTimeout(load(vault), 5000, 'load()');
    assert.ok(state.searchIndex.has('/good/'), '失敗していないファイルは検索に載る');
    assert.ok(logged.mock.calls.some((c) => String(c.arguments[0]).includes('初回走査')), '失敗がログに残る');
  });
});

test('起動後の add / change で反映に失敗しても unhandled rejection にならない', async (t) => {
  t.mock.method(console, 'error', () => {});
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await withVault({ 'good.md': '# g\n' }, async (vault) => {
      await withTimeout(load(vault), 5000, 'load()');
      const attempted = failSearchIndexAddFor(['/late/', '/good/']);

      writeFileSync(join(vault, 'late.md'), '# late\n');
      await waitFor(() => attempted.includes('/late/'), 5000, 'late.md の add');
      writeFileSync(join(vault, 'good.md'), '# changed\n');
      await waitFor(() => attempted.includes('/good/'), 5000, 'good.md の change');

      // reject がハンドラに届くまで数ティック待ってから判定する
      await new Promise((r) => setTimeout(r, 50));
      assert.deepEqual(unhandled, []);
    });
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
