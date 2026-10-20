// 生成 HTML の配色をビューアのテーマに合わせる。生成物には色を --mlv-* の変数だけで書かせ
// （lib/rich-generator.js のプロンプト）、/_rich で配信するときにテーマの色で上書きする。
// ファイルを直接開いたときは上書きされず、生成物が自分で決めた配色（とダークモード）で表示される
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// 生成物の変数名 → テーマ CSS（assets/css/<theme>.css）の変数名
const VAR_MAP = {
  '--mlv-bg': '--bg',
  '--mlv-surface': '--surface',
  '--mlv-surface-2': '--surface-2',
  '--mlv-ink': '--ink',
  '--mlv-ink-soft': '--ink-soft',
  '--mlv-muted': '--muted',
  '--mlv-line': '--line',
  '--mlv-accent': '--accent',
  '--mlv-accent-soft': '--accent-soft',
  '--mlv-accent-strong': '--accent-pressed',
};

export const RICH_COLOR_VARS = Object.keys(VAR_MAP);

// テーマ CSS は自前のファイルだが、<style> に埋め込むので CSS や HTML を壊す文字を含む値は使わない
const SAFE_VALUE = /^[#\w\s.,%()-]+$/;

function themeVars(css) {
  const vars = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]*)/g)) {
    if (!(m[1] in vars)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

// :root:root で生成物の :root（@media (prefers-color-scheme: dark) 内を含む）より詳細度を上げ、
// body に変数を定義された場合にも勝つよう :root body も指定する。テーマはどれも明るい配色
export function themeOverrideCss(css) {
  const vars = themeVars(css);
  const decls = ['color-scheme:light'];
  for (const [richVar, themeVar] of Object.entries(VAR_MAP)) {
    const value = vars[themeVar];
    if (value && SAFE_VALUE.test(value)) decls.push(`${richVar}:${value}`);
  }
  return `:root:root,:root body{${decls.join(';')}}`;
}

// テーマ名 → 上書き用 CSS。テーマ CSS は起動中に変わらない前提で、起動時に一度だけ読む
export function loadThemes(cssDir) {
  const themes = new Map();
  for (const file of readdirSync(cssDir)) {
    if (!file.endsWith('.css') || file.startsWith('_')) continue;
    themes.set(file.slice(0, -4), themeOverrideCss(readFileSync(path.join(cssDir, file), 'utf8')));
  }
  return themes;
}
