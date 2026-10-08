import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap } from '../lib/template.js';

test('content 中の $ メタ文字（$& $\' $`）が置換で化けない', () => {
  const content = "<p>price: $&amp; and $' and $` and $1</p>";
  const html = wrap({ title: 't', content, source: 's' });
  assert.ok(html.includes(content), 'content がそのまま埋め込まれる');
  assert.doesNotMatch(html, /\{\{\s*content\s*\}\}/);
});

test('title に {{content}} が含まれても content が再注入されない', () => {
  const html = wrap({
    title: '{{content}}',
    content: '<p>SECRET BODY</p>',
    source: 's',
  });
  // <title> 内に本文 HTML が展開されない
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/);
  assert.ok(titleTag);
  assert.doesNotMatch(titleTag[1], /SECRET BODY/);
  // 本文は本来の 1 箇所のみ
  assert.equal((html.match(/SECRET BODY/g) || []).length, 1);
});

test('rawLink は生挿入され、未指定ならプレースホルダが空になる', () => {
  const link = '<a class="raw-link" href="/_raw/a/">Raw</a>';
  assert.ok(wrap({ title: 't', content: '', source: 's', rawLink: link }).includes(link));

  const html = wrap({ title: 't', content: '', source: 's' });
  assert.doesNotMatch(html, /\{\{\s*rawLink\s*\}\}/);
  assert.doesNotMatch(html, /raw-link/);
});

test('title に {{rawLink}} が含まれても rawLink が再注入されない', () => {
  const html = wrap({
    title: '{{rawLink}}',
    content: '',
    source: 's',
    rawLink: '<a class="raw-link">Raw</a>',
  });
  assert.equal((html.match(/raw-link/g) || []).length, 1);
});

test('title 中の $ メタ文字も化けない', () => {
  const html = wrap({ title: "a $' b", content: '<p>x</p>', source: 's' });
  assert.ok(html.includes("a $' b"), 'title がそのまま埋め込まれる');
  assert.doesNotMatch(html, /\{\{\s*title\s*\}\}/);
});
