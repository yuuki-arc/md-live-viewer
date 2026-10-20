import { pageKey } from './url-path.js';

// ページ内で共有する SSE。ブラウザは同じホストへの HTTP/1.1 接続を 6 本までに制限し、SSE は
// 接続を張りっぱなしにするので、1 ページで何本も開くと数タブで使い切ってツリー取得などが止まる。
// 他のスクリプト（rich-view.js）は自分で開かずにこれを使う。
// タブを何枚開いても上限に届かないよう、表示中のタブだけが接続を持つ。裏に回ったとき
// （visibilitychange）と、離れたページが back-forward cache に入るとき（pagehide）に閉じ、
// 表に戻ったときにつなぎ直す。閉じている間のイベントは、最後に受け取った id を ?since= で
// 渡してサーバに送り直してもらう（lib/sse.js）。
// つなぎ直しても同じリスナーが働くよう、EventSource そのものではなく薄い包みを渡す
const listeners = [];
let source = null;
let lastEventId = '';

function connect() {
  const since = lastEventId ? '?since=' + encodeURIComponent(lastEventId) : '';
  source = new EventSource('/api/live' + since);
  for (const [type, fn] of listeners) source.addEventListener(type, fn);
}

function disconnect() {
  if (source) source.close();
  source = null;
}

// 表示中なら接続し、裏に回っていれば閉じる
function sync() {
  if (document.visibilityState === 'visible') {
    if (!source) connect();
  } else {
    disconnect();
  }
}

export const liveEvents = window.EventSource
  ? {
      addEventListener(type, fn) {
        const listener = (e) => {
          if (e.lastEventId) lastEventId = e.lastEventId;
          fn(e);
        };
        listeners.push([type, listener]);
        if (source) source.addEventListener(type, listener);
      },
      get readyState() {
        return source ? source.readyState : EventSource.CLOSED;
      },
    }
  : null;

if (liveEvents) {
  // 裏で開いたタブ（Cmd+クリックなど）は、表示されるまで接続しない
  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', disconnect);
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) sync();
  });

  // 接続のたびにサーバが今の位置（id）を知らせる。記録だけして、取りこぼしの起点にする
  liveEvents.addEventListener('hello', function () {});

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
