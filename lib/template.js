import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', '_includes', 'base.html');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// rawLink は content と同様に生挿入する。条件分岐が書けないテンプレートなので、
// リンクを出すページだけが組み立て済みの HTML 断片を渡す。
export function wrap({ title, content, source, rawLink }) {
  const tpl = readFileSync(TEMPLATE_PATH, 'utf8');
  return tpl
    .replace(/\{\{\s*title\s*\}\}/g, escapeHtml(title))
    .replace(/\{\{\s*source\s*\}\}/g, escapeHtml(source || ''))
    .replace(/\{\{\s*rawLink\s*\}\}/g, rawLink || '')
    .replace(/\{\{\s*content\s*\}\}/g, content);
}
