import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './escape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', '_includes', 'base.html');

// rawLink は content と同様に生挿入する。条件分岐が書けないテンプレートなので、
// リンクを出すページだけが組み立て済みの HTML 断片を渡す。
export function wrap({ title, content, source, rawLink }) {
  const tpl = readFileSync(TEMPLATE_PATH, 'utf8');
  // シングルパスで置換する。逐次 replace だと title に {{content}} を
  // 含むページで本文が <title> に再注入される。関数形式なのは置換文字列の
  // $& 等のメタ文字を展開させないため
  const values = {
    title: escapeHtml(title),
    source: escapeHtml(source || ''),
    rawLink: rawLink || '',
    content,
  };
  return tpl.replace(
    /\{\{\s*(title|source|rawLink|content)\s*\}\}/g,
    (match, key) => values[key]
  );
}
