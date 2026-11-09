import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../lib/render.js';

function renderMd(content) {
  const dir = mkdtempSync(join(tmpdir(), 'mlv-link-'));
  const file = join(dir, 'note.md');
  writeFileSync(file, content);
  try {
    return render(file).html;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function hrefOf(src) {
  const m = renderMd(src + '\n').match(/<a href="([^"]*)"/);
  assert.ok(m, `${src} がリンクとして出力される`);
  return m[1];
}

// ページは /<dir>/<name>/ で配信されるため、ファイル基準の相対リンクは
// ページ基準では 1 階層上（../）から解決し直し、.md を落として末尾 / にする
for (const [src, href] of [
  ['[a](sibling.md)', '../sibling/'],
  ['[a](./sibling.md)', '.././sibling/'],
  ['[a](sub/child.md)', '../sub/child/'],
  ['[a](../up.md)', '../../up/'],
  ['[a](sibling.MD)', '../sibling/'],
  ['[a](sibling.md#見出し)', '../sibling/#%E8%A6%8B%E5%87%BA%E3%81%97'],
  ['[a](sibling.md?x=1)', '../sibling/?x=1'],
  ['[a](メモ.md)', '../%E3%83%A1%E3%83%A2/'],
  ['[a](<a b.md>)', '../a%20b/'],
]) {
  test(`相対リンク ${src} はページ URL ${href} を指す`, () => {
    assert.equal(hrefOf(src), href);
  });
}

test('ルート絶対パスの .md は .md を落として末尾 / にする（相対の補正はしない）', () => {
  assert.equal(hrefOf('[a](/dir/page.md)'), '/dir/page/');
});

// .md 以外の相対リンク（画像・PDF・ディレクトリなど）も基準だけ 1 階層上に合わせる
for (const [src, href] of [
  ['[a](image.png)', '../image.png'],
  ['[a](./image.png)', '.././image.png'],
  ['[a](sub/image.png)', '../sub/image.png'],
  ['[a](../up.png)', '../../up.png'],
  ['[a](dir/)', '../dir/'],
  ['[a](notes.markdown)', '../notes.markdown'],
  ['[a](図.png#x)', '../%E5%9B%B3.png#x'],
]) {
  test(`相対リンク ${src} はファイル基準の ${href} を指す`, () => {
    assert.equal(hrefOf(src), href);
  });
}

for (const src of [
  '[a](https://example.com/README.md)',
  '[a](//example.com/x.md)',
  '[a](mailto:x@example.com)',
  '[a](#heading)',
  '[a](?q=1)',
  '[a](/_attachments/image.png)',
]) {
  test(`${src} は書き換えない`, () => {
    const expected = src.match(/\]\((.*)\)$/)[1];
    assert.equal(hrefOf(src), expected);
  });
}

function srcOf(src) {
  const m = renderMd(src + '\n').match(/<img src="([^"]*)"/);
  assert.ok(m, `${src} が画像として出力される`);
  return m[1];
}

for (const [src, expected] of [
  ['![x](image.png)', '../image.png'],
  ['![x](sub/image.svg)', '../sub/image.svg'],
  ['![x](../up.png)', '../../up.png'],
  ['![x](/_attachments/a.png)', '/_attachments/a.png'],
  ['![x](https://example.com/a.png)', 'https://example.com/a.png'],
  ['![x](data:image/png;base64,AAAA)', 'data:image/png;base64,AAAA'],
]) {
  test(`画像 ${src} の src は ${expected}`, () => {
    assert.equal(srcOf(src), expected);
  });
}

test('autolink（linkify）の外部 .md URL も書き換えない', () => {
  assert.equal(hrefOf('https://example.com/a.md'), 'https://example.com/a.md');
});
