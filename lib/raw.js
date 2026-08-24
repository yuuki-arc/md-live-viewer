// 生 Markdown ビュー（JS を一切載せずファイル内容をそのまま返すモード）の URL 変換。
// state やファイル I/O に依存しない純粋関数だけを置き、ユニットテスト可能にしている。

const PREFIX = '/_raw';

// '/_raw/a/b' -> '/a/b/'（state.index のキー形式）。対象外のパスは null。
export function rawPathToUrl(reqPath) {
  const p = String(reqPath);
  if (p !== PREFIX && !p.startsWith(PREFIX + '/')) return null;
  const rest = p.slice(PREFIX.length);
  if (rest === '' || rest === '/') return null;
  return rest.endsWith('/') ? rest : rest + '/';
}

// '/a/b/' -> '/_raw/a/b/'。state.index のキーは未エンコードなのでここで encode する。
export function toRawHref(pageUrl) {
  const segs = String(pageUrl).split('/').filter(Boolean).map(encodeURIComponent);
  return segs.length ? `${PREFIX}/${segs.join('/')}/` : `${PREFIX}/`;
}
