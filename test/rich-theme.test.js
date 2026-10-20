import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RICH_COLOR_VARS, themeOverrideCss, loadThemes } from '../lib/rich-theme.js';

const CSS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'css');

const SAMPLE = `:root {
  --bg:          #FDF3F2;
  --bg-alt:      #F5E1E1;
  --surface:     #FFFAFA;
  --surface-2:   #F8E8E8;
  --ink:         #3B2A2E;
  --ink-soft:    #5A4248;
  --muted:       #9A7E84;
  --line:        #EBD5D5;
  --accent:         #D87A8E;
  --accent-soft:    #F6CFD7;
  --accent-pressed: #B85E73;
  --fz-xs:12px;
}`;

test('テーマ CSS の変数を生成 HTML 用の --mlv-* に読み替える', () => {
  const css = themeOverrideCss(SAMPLE);
  assert.match(css, /--mlv-bg:#FDF3F2/);
  assert.match(css, /--mlv-surface:#FFFAFA/);
  assert.match(css, /--mlv-surface-2:#F8E8E8/);
  assert.match(css, /--mlv-ink:#3B2A2E/);
  assert.match(css, /--mlv-accent-strong:#B85E73/);
  // 色以外の変数は渡さない
  assert.doesNotMatch(css, /fz-xs/);
});

test('生成物の :root やダークモードの定義より優先され、ライト配色として扱う', () => {
  const css = themeOverrideCss(SAMPLE);
  assert.match(css, /^:root:root,:root body\{/);
  assert.match(css, /color-scheme:light/);
});

test('値に CSS を壊す文字があれば、その変数は使わない', () => {
  const css = themeOverrideCss(':root { --bg: red;} body{x:y}; --ink: #000; --accent: url(</style>); }');
  assert.doesNotMatch(css, /<\/style>/);
  assert.match(css, /--mlv-ink:#000/);
});

test('assets/css の全テーマを読み込み、どのテーマも全色を持つ', () => {
  const themes = loadThemes(CSS_DIR);
  const names = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css') && !f.startsWith('_')).map((f) => f.slice(0, -4));
  assert.deepEqual([...themes.keys()].sort(), names.sort());
  for (const [name, css] of themes) {
    for (const v of RICH_COLOR_VARS) assert.match(css, new RegExp(`${v}:`), `${name} に ${v} が無い`);
  }
});
