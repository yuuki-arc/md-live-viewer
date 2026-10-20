// /_rich/ で配信するリッチ HTML の URL 変換と、配信前の加工。
// 生成物は LLM の出力でそのまま信用できないため、ビューア本体とは別オリジン扱いの sandbox で表示する
import { prefixedPathToUrl, toPrefixedHref } from './raw.js';

const PREFIX = '/_rich';

export function richPathToUrl(reqPath) {
  return prefixedPathToUrl(PREFIX, reqPath);
}

export function toRichHref(pageUrl) {
  return toPrefixedHref(PREFIX, pageUrl);
}

// allow-same-origin を付けないので、生成物のスクリプトはビューアの API・Cookie・localStorage に
// 触れない（Origin: null になり host.js の検証でも弾かれる）。外部リソースの読み込み・通信・
// フォーム送信も禁じ、自己完結した HTML だけを表示する。ただし元の Markdown の外部リンクを
// 開けるよう、リンクのクリックで新しいタブを開くこと（allow-popups）は許している。
// iframe の外から直接開かれた場合にも効くようヘッダで付ける
export const RICH_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

// sandbox 内の文書の高さは親から読めないため、文書側から postMessage で知らせて
// iframe を内容の高さに合わせる（assets/js/rich-view.js が受け取る）。
// 生成物が body { min-height: 100vh } などを指定していると、iframe を伸ばすたびに
// 文書も伸びて止まらなくなるため、高さ指定は打ち消す
const HEIGHT_SCRIPT = `<style>html,body{height:auto!important;min-height:0!important}</style><script>(function(){function s(){parent.postMessage({type:'mlv-rich-height',height:document.documentElement.scrollHeight},'*')}addEventListener('load',s);new ResizeObserver(s).observe(document.documentElement);s()})()</script>`;

export function decorateRichHtml(html) {
  const i = html.toLowerCase().lastIndexOf('</body>');
  if (i === -1) return html + HEIGHT_SCRIPT;
  return html.slice(0, i) + HEIGHT_SCRIPT + html.slice(i);
}
