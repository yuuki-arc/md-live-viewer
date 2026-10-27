import { state } from './state.js';

const FUZZY = 0.2;
const PREFIX = true;

// パスはディレクトリ単位で比べる。文字列のまま比べると "a-b/x" が "a/z" より前に来て、
// 同じディレクトリの中身がまとまらない。ツリーと同じく ja ロケールで比べる
function comparePath(a, b) {
  const as = a.split('/');
  const bs = b.split('/');
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    // ja では「カ」と「か」のような別の名前が同じとみなされることがあるので、そのときは文字列で決める
    const c = as[i].localeCompare(bs[i], 'ja') || (as[i] < bs[i] ? -1 : as[i] > bs[i] ? 1 : 0);
    if (c) return c;
  }
  return as.length - bs.length;
}

// sort: 'score' は関連度順（同点はパス順）、'path' はパスの辞書順。それ以外は 'score' 扱い
export function search(query, { sort = 'score', limit = 50 } = {}) {
  const q = (query || '').trim();
  if (!q) return { query: q, results: [] };

  const hits = state.searchIndex.search(q, {
    fuzzy: FUZZY,
    prefix: PREFIX,
    boost: { name: 2 },
    combineWith: 'AND',
  });

  // 同点の並びは登録順（ファイル走査や更新の順）のままだと見るたびに揺れるので、パス順で決める
  hits.sort((a, b) => b.score - a.score || comparePath(a.path, b.path));
  // path でも上限は関連度の高い順に取る。先にパス順で切ると、よく一致する結果が落ちることがある
  const top = hits.slice(0, limit);
  if (sort === 'path') top.sort((a, b) => comparePath(a.path, b.path));

  const results = top.map((hit) => ({
    url: hit.url,
    name: hit.path,
    score: hit.score,
  }));

  return { query: q, results };
}

// url は state.index のキー（実ファイル名そのまま・未エンコード）なのでデコードしない。
// デコードすると "50% off.md" のようなファイル名で URIError になる
export function buildDoc(url) {
  const decoded = url.replace(/^\/|\/$/g, '');
  const segs = decoded.split('/').filter(Boolean);
  const name = segs[segs.length - 1] || decoded;
  return { url, name, path: decoded };
}
