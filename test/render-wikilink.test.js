import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../lib/render.js';
import { encodePath } from '../assets/js/url-path.js';

function renderMd(content) {
  const dir = mkdtempSync(join(tmpdir(), 'mlv-wikilink-'));
  const file = join(dir, 'note.md');
  writeFileSync(file, content);
  try {
    return render(file).html;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function links(html) {
  return [...html.matchAll(/<a href="([^"]*)" class="wikilink">([^<]*)<\/a>/g)]
    .map((m) => ({ href: m[1], label: m[2] }));
}

// href はサイドバーのリンクと同じ正規形（セグメント単位でエンコード・末尾 /）にする。
// 末尾 / が %2F になったり欠けたりすると、ページ内の相対リンクの基準がずれる
for (const [src, key] of [
  ['[[top]]', '/top/'],
  ['[[a/b/c]]', '/a/b/c/'],
  ['[[メモ]]', '/メモ/'],
  ['[[Q&A]]', '/Q&A/'],
  ['[[a b]]', '/a b/'],
  ['[[メモ/子]]', '/メモ/子/'],
  ['[[ spaced ]]', '/spaced/'],
]) {
  test(`${src} は ${key} を正規形の href で指す`, () => {
    const [link] = links(renderMd(src + '\n'));
    assert.ok(link, 'wikilink が出力される');
    assert.equal(link.href, encodePath(key));
  });
}

test('ラベルはページ名（パスを含む表記のまま）', () => {
  assert.equal(links(renderMd('[[a/b/c]]\n'))[0].label, 'a/b/c');
});

test('別名付き [[page|label]] は label を表示し page を指す', () => {
  const [link] = links(renderMd('[[a/b/c|別名]]\n'));
  assert.deepEqual(link, { href: '/a/b/c/', label: '別名' });
});

test('見出し付き [[page#heading]] はページ URL にフラグメントを付け、ラベルはページ名', () => {
  const [link] = links(renderMd('[[メモ#見出し]]\n'));
  assert.deepEqual(link, { href: encodePath('/メモ/') + '#' + encodeURIComponent('見出し'), label: 'メモ' });
});

test('ラベルは HTML エスケープされる', () => {
  const html = renderMd('[[a|<b>x</b>]]\n');
  assert.match(html, /class="wikilink">&lt;b&gt;x&lt;\/b&gt;<\/a>/);
});

test('コードスパン内の [[...]] はリンク化しない', () => {
  assert.deepEqual(links(renderMd('`[[top]]`\n')), []);
});

test('. や .. のパス要素を含む wikilink は別ページを指さないようリンク化しない', () => {
  for (const src of ['[[../x]]', '[[a/../b]]', '[[./x]]']) {
    assert.deepEqual(links(renderMd(src + '\n')), [], src);
  }
});
