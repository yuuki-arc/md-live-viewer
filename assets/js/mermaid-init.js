// ```mermaid フェンス（lib/render.js が <pre class="mermaid"> として出力）を SVG に描画する。
// CDN から読み込めない場合（オフライン等）や図の構文エラー時は、
// ソースコード表示のまま残す。
// バージョンは完全固定にする（レンジ指定だと jsdelivr のキャッシュが短命になるため）。
(async function () {
  var nodes = document.querySelectorAll('pre.mermaid');
  if (nodes.length === 0) return;
  var mermaid;
  try {
    mermaid = (await import(
      'https://cdn.jsdelivr.net/npm/mermaid@11.17.0/dist/mermaid.esm.min.mjs'
    )).default;
  } catch (err) {
    console.warn('[md-live-viewer] mermaid を CDN から読み込めませんでした（コード表示のまま継続）:', err);
    return;
  }
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      suppressErrorRendering: true,
    });
  } catch (err) {
    console.warn('[md-live-viewer] mermaid の初期化に失敗（コード表示のまま継続）:', err);
    return;
  }
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var source = node.textContent;
    try {
      await mermaid.run({ nodes: [node] });
    } catch (err) {
      // 構文エラー等: ソース表示・コードブロックの見た目に戻す
      node.removeAttribute('data-processed');
      node.textContent = source;
      console.warn('[md-live-viewer] mermaid の描画に失敗:', err);
    }
  }
})();
