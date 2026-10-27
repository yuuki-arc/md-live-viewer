import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDoc, search } from '../lib/search.js';
import { state, resetState } from '../lib/state.js';

test('index のキー（未エンコードのパス）から name と path を作る', () => {
  assert.deepEqual(buildDoc('/a/b/c/'), { url: '/a/b/c/', name: 'c', path: 'a/b/c' });
});

test('ファイル名に % を含んでも例外にならず、そのままの名前で登録される', () => {
  assert.deepEqual(buildDoc('/50% off/'), { url: '/50% off/', name: '50% off', path: '50% off' });
});

test('%XX 形式に見えるファイル名をデコードしない', () => {
  assert.deepEqual(buildDoc('/a%20b/'), { url: '/a%20b/', name: 'a%20b', path: 'a%20b' });
});

// 登録順をわざとパス順から崩しておき、並びが登録順に引きずられないことを確かめる
function withDocs(urls, fn) {
  resetState();
  try {
    for (const url of urls) state.searchIndex.add(buildDoc(url));
    return fn();
  } finally {
    resetState();
  }
}

const NOTION = [
  '/notion-pages/tasks/st-1/t7-domain-protection/',
  '/notion-pages/stories/st-3/',
  '/notion-pages/README/',
  '/notion-pages/stories/st-1/',
  '/notion-pages/tasks/st-2/tk-2-split-mail-domain/',
  '/notion-pages/stories/st-2/',
  '/notion-pages/tasks/st-1/t1-check-current-state/',
  '/notion-pages/epics/e1/',
];

test('既定（関連度順）では、スコアが同じ結果をパス順に並べる', () => {
  withDocs(NOTION, () => {
    const names = search('notion-pages/').results.map((r) => r.name);
    const stories = names.filter((n) => n.startsWith('notion-pages/stories/'));
    assert.deepEqual(stories, [
      'notion-pages/stories/st-1',
      'notion-pages/stories/st-2',
      'notion-pages/stories/st-3',
    ]);
    // 関連度順なので、短い（よく一致する）パスが上に来る
    assert.equal(names[0], 'notion-pages/README');
  });
});

test('sort=path ではスコアに関係なくパスの辞書順に並べる', () => {
  withDocs(NOTION, () => {
    const names = search('notion-pages/', { sort: 'path' }).results.map((r) => r.name);
    assert.deepEqual(names, [
      'notion-pages/epics/e1',
      'notion-pages/README',
      'notion-pages/stories/st-1',
      'notion-pages/stories/st-2',
      'notion-pages/stories/st-3',
      'notion-pages/tasks/st-1/t1-check-current-state',
      'notion-pages/tasks/st-1/t7-domain-protection',
      'notion-pages/tasks/st-2/tk-2-split-mail-domain',
    ]);
  });
});

test('sort=path でもディレクトリ単位で比べる（"a/z" は "a-b/x" より前）', () => {
  withDocs(['/a-b/x/', '/a/z/'], () => {
    const names = search('a', { sort: 'path' }).results.map((r) => r.name);
    assert.deepEqual(names, ['a/z', 'a-b/x']);
  });
});

test('sort=path でも件数の上限は関連度の高い順に取ってから並べ替える', () => {
  withDocs(['/zz/', '/aa/zz/deep/deeper/'], () => {
    const names = search('zz', { sort: 'path', limit: 1 }).results.map((r) => r.name);
    assert.deepEqual(names, ['zz']);
  });
});

test('未知の sort は関連度順として扱う', () => {
  withDocs(NOTION, () => {
    assert.deepEqual(
      search('notion-pages/', { sort: 'bogus' }).results,
      search('notion-pages/').results,
    );
  });
});

test('ja の照合で同じとみなされる別のパス（カ / か）も、登録順に関係なく同じ並びになる', () => {
  const order = (urls) => withDocs(urls, () => search('memo', { sort: 'path' }).results.map((r) => r.name));
  assert.deepEqual(order(['/memo/か/', '/memo/カ/']), order(['/memo/カ/', '/memo/か/']));
  const byScore = (urls) => withDocs(urls, () => search('memo').results.map((r) => r.name));
  assert.deepEqual(byScore(['/memo/か/', '/memo/カ/']), byScore(['/memo/カ/', '/memo/か/']));
});
