// 現在ページの URL から、サイドバーで初期展開すべき祖先ディレクトリの
// slug 一覧（ルートに近い順）を導出する純粋関数。
// 末尾セグメントはページ自身なので除外する。
// tree 側の slug は実ファイル名（デコード済み）なので、ここでもデコードして揃える。
export function ancestorSlugs(pathname) {
  const segs = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch (_) {
        return seg;
      }
    });

  const ancestors = [];
  for (let i = 1; i < segs.length; i++) {
    ancestors.push(segs.slice(0, i).join('/'));
  }
  return ancestors;
}
