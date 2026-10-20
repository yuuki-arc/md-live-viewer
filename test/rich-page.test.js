import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richPathToUrl, toRichHref, decorateRichHtml, RICH_CSP } from '../lib/rich-page.js';

test('/_rich/ 配下のパスをページ URL に戻す', () => {
  assert.equal(richPathToUrl('/_rich/a/b/'), '/a/b/');
  assert.equal(richPathToUrl('/_rich/a/b'), '/a/b/');
  assert.equal(richPathToUrl('/_rich/'), null);
  assert.equal(richPathToUrl('/_richer/a/'), null);
  assert.equal(richPathToUrl('/a/'), null);
});

test('ページ URL から rich ビューの href を組み立てる', () => {
  assert.equal(toRichHref('/メモ/a b/'), '/_rich/%E3%83%A1%E3%83%A2/a%20b/');
});

test('CSP は sandbox（allow-same-origin なし）で外部への通信を禁じる', () => {
  assert.match(RICH_CSP, /sandbox allow-scripts/);
  assert.doesNotMatch(RICH_CSP, /allow-same-origin/);
  assert.match(RICH_CSP, /default-src 'none'/);
  assert.match(RICH_CSP, /connect-src 'none'/);
});

test('decorateRichHtml は </body> の直前に高さ通知スクリプトと高さ指定の打ち消しを差し込む', () => {
  const out = decorateRichHtml('<html><body><p>x</p></body></html>');
  assert.match(out, /<p>x<\/p><style>[\s\S]*min-height:0[\s\S]*<script>[\s\S]*mlv-rich-height[\s\S]*<\/script><\/body><\/html>$/);
});

test('</body> が無い文書では末尾に差し込む', () => {
  const out = decorateRichHtml('<p>x</p>');
  assert.ok(out.startsWith('<p>x</p><style>'));
});

test('</body> が複数あっても最後の 1 箇所にだけ差し込む', () => {
  const out = decorateRichHtml('<pre>&lt;/body&gt; </body></pre></body>');
  assert.equal((out.match(/mlv-rich-height/g) || []).length, 1);
  assert.ok(out.endsWith('</script></body>'));
});
