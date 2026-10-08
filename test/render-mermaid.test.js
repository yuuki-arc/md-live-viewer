import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from '../lib/render.js';

function withTempMd(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mlv-render-'));
  const file = join(dir, 'note.md');
  writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('mermaid フェンスは <pre class="mermaid"> として出力される', () => {
  const src = '# t\n\n```mermaid\nflowchart TB\n  A --> B\n```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<pre class="mermaid">flowchart TB\n {2}A --&gt; B\n?<\/pre>/);
    assert.doesNotMatch(html, /language-mermaid/);
  });
});

test('mermaid フェンス内の HTML はエスケープされる', () => {
  const src = '```mermaid\nflowchart TB\n  A["<script>"] --> B\n```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});

test('mermaid 以外のフェンスは従来どおりコードブロックになる', () => {
  const src = '```js\nconst a = 1;\n```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<pre><code class="language-js">/);
  });
});

test('callout 内の mermaid フェンスも描画対象になる', () => {
  const src = '> [!note]\n> ```mermaid\n> flowchart TB\n>   A --> B\n> ```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<pre class="mermaid">/);
  });
});

test('大文字の ```Mermaid フェンスも描画対象になる', () => {
  const src = '```Mermaid\nflowchart TB\n  A --> B\n```\n';
  withTempMd(src, (file) => {
    const { html } = render(file);
    assert.match(html, /<pre class="mermaid">/);
  });
});

test('callout 内で先行テキストと空行入り mermaid があっても HTML が壊れない', () => {
  const src = [
    '> [!note]',
    '> before',
    '> ```mermaid',
    '> flowchart TB',
    '>',
    '>   A --> B',
    '> ```',
    '> after',
  ].join('\n');
  withTempMd(src, (file) => {
    const { html } = render(file);
    const m = html.match(/<pre class="mermaid">([\s\S]*?)<\/pre>/);
    assert.ok(m, 'pre.mermaid が出力される');
    // pre 内に <p> 等のタグが紛れ込まない（図のソースがそのまま保持される）
    assert.doesNotMatch(m[1], /<p>/);
    assert.match(m[1], /flowchart TB\n\n {2}A --&gt; B/);
  });
});
