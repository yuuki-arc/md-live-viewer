// 見出しテキストからアンカー ID を作る。toc.js（見出しへの ID 付与）と
// wikilink の [[page#heading]]（リンク先フラグメント）で同じ規則を共有するため切り出している。
// 文字・数字・- _ 以外を除いた結果が空なら空文字を返す
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}\-_]/gu, '');
}
