// 生 Markdown ビュー（JS を一切載せずファイル内容をそのまま返すモード）の URL 変換。
// state やファイル I/O に依存しない純粋関数だけを置き、ユニットテスト可能にしている。
// 接頭辞付きの変換は /_rich/（lib/rich-page.js）でも共有する。

const PREFIX = '/_raw';

// ('/_raw', '/_raw/a/b') -> '/a/b/'（state.index のキー形式）。対象外のパスは null。
export function prefixedPathToUrl(prefix, reqPath) {
  const p = String(reqPath);
  if (p !== prefix && !p.startsWith(prefix + '/')) return null;
  const rest = p.slice(prefix.length);
  if (rest === '' || rest === '/') return null;
  return rest.endsWith('/') ? rest : rest + '/';
}

// ('/_raw', '/a/b/') -> '/_raw/a/b/'。state.index のキーは未エンコードなのでここで encode する。
export function toPrefixedHref(prefix, pageUrl) {
  const segs = String(pageUrl).split('/').filter(Boolean).map(encodeURIComponent);
  return segs.length ? `${prefix}/${segs.join('/')}/` : `${prefix}/`;
}

export function rawPathToUrl(reqPath) {
  return prefixedPathToUrl(PREFIX, reqPath);
}

export function toRawHref(pageUrl) {
  return toPrefixedHref(PREFIX, pageUrl);
}
