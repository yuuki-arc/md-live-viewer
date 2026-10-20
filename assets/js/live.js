import { pageKey } from './url-path.js';

// ページ内で共有する SSE。ブラウザは同じホストへの HTTP/1.1 接続を 6 本までに制限し、SSE は
// 接続を張りっぱなしにするので、1 ページで何本も開くと数タブで使い切ってツリー取得などが止まる。
// 他のスクリプト（rich-view.js）は自分で開かずにこれを使う。
// 離れたページを Chrome が back-forward cache に残すと、その SSE も張られたままになり、数ページ移動した
// だけで上限に達する。そのため pagehide で閉じ、bfcache から戻ったとき（pageshow）につなぎ直す。
// つなぎ直しても同じリスナーが働くよう、EventSource そのものではなく薄い包みを渡す
const listeners = [];
let source = null;

function connect() {
  source = new EventSource('/api/live');
  for (const [type, fn] of listeners) source.addEventListener(type, fn);
}

export const liveEvents = window.EventSource
  ? {
      addEventListener(type, fn) {
        listeners.push([type, fn]);
        if (source) source.addEventListener(type, fn);
      },
      get readyState() {
        return source ? source.readyState : EventSource.CLOSED;
      },
    }
  : null;

if (liveEvents) {
  connect();
  window.addEventListener('pagehide', function () {
    if (source) source.close();
    source = null;
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && !source) connect();
  });

  liveEvents.addEventListener('reload', function (e) {
    try {
      const scope = JSON.parse(e.data || '{}').scope;
      // scope は index のキー形式（デコード済み）、location.pathname はエンコード済み
      // なので、そのまま比べると日本語名などのページで一致しない
      if (scope === 'all' || scope === pageKey(location.pathname)) {
        location.reload();
      }
    } catch (_) {}
  });
}
