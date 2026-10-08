import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../lib/render.js';

function withTempMd(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mlv-callout-'));
  const file = join(dir, 'note.md');
  writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('callout はタイトルと本文を持つ aside として出力される', () => {
  const src = '> [!warning] 注意\n> 本文です\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<aside class="callout callout-warning">/);
    assert.match(html, /<div class="callout-title">注意<\/div>/);
    assert.match(html, /本文です/);
  });
});

test('callout 内の wikilink もリンク化される', () => {
  const src = '> [!note]\n> see [[Other Page]]\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<aside class="callout callout-note">[\s\S]*<a[^>]*class="wikilink"[^>]*>Other Page<\/a>/);
  });
});

test('コードフェンス内の callout 記法は callout 化されずコードのまま表示される', () => {
  const src = '```markdown\n> [!note] Example\n> body\n```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.doesNotMatch(html, /<aside/);
    assert.match(html, /&gt; \[!note\] Example/);
  });
});

test('隣接する callout は 2 つの aside に分かれる', () => {
  const src = '> [!note] A\n> a body\n> [!tip] B\n> b body\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /callout-note/);
    assert.match(html, /callout-tip/);
    assert.equal((html.match(/<aside/g) || []).length, 2);
    assert.doesNotMatch(html, /\[!tip\]/);
  });
});

test('CRLF 改行のファイルでもタイトル付き callout が aside になる', () => {
  const src = '> [!note] Title\r\n> body\r\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<aside class="callout callout-note">/);
    assert.match(html, /<div class="callout-title">Title<\/div>/);
    assert.doesNotMatch(html, /\[!note\]/);
  });
});

test('本文中にプレースホルダ風のテキストがあっても callout の位置が乗っ取られない', () => {
  const src = '@@mlv-callout-0@@\n\n> [!note]\n> real callout\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    // リテラルテキストは残り、aside は callout の位置に 1 つだけ
    assert.match(html, /<p>@@mlv-callout-0@@<\/p>/);
    assert.equal((html.match(/<aside/g) || []).length, 1);
    assert.match(html, /real callout/);
    // 未置換のプレースホルダが漏れない（リテラル以外に @@ トークンが残らない）
    const leftovers = (html.match(/@@mlv-callout-[^@]*@@/g) || []).filter(
      (t) => t !== '@@mlv-callout-0@@'
    );
    assert.deepEqual(leftovers, []);
  });
});

test('blockquote 内のコードフェンスに引用された callout 記法は callout 化されない', () => {
  const src = '> ```\n> [!note] inside code\n> ```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.doesNotMatch(html, /<aside/);
    assert.match(html, /\[!note\] inside code/);
  });
});

test('raw HTML ブロック内に引用された callout 記法は callout 化されない', () => {
  const src = '<pre>\n> [!note] x\n> y\n</pre>\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.doesNotMatch(html, /<aside/);
    assert.match(html, /\[!note\] x/);
  });
});

test('リスト項目内の callout も aside になる', () => {
  const src = '1. one\n\n   > [!note] T\n   > body\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<aside class="callout callout-note">/);
    assert.match(html, /<div class="callout-title">T<\/div>/);
    assert.doesNotMatch(html, /\[!note\]/);
  });
});

test('marker で始まらない通常の blockquote はそのまま', () => {
  const src = '> plain quote\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<blockquote>/);
    assert.doesNotMatch(html, /<aside/);
  });
});

test('callout の前後にある通常の段落は影響を受けない', () => {
  const src = 'before\n\n> [!tip]\n> tip body\n\nafter\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<p>before<\/p>/);
    assert.match(html, /<p>after<\/p>/);
    assert.match(html, /<aside class="callout callout-tip">/);
  });
});
