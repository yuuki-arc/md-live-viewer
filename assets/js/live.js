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
// サーバがページを返したときの位置（lib/sse.js の currentId）。最初の接続からこれを ?since= で渡すので、
// ページを返してから SSE がつながるまでの変更や、裏で開いて表示する前の変更も取りこぼさない
let lastEventId = document.querySelector('meta[name="mlv-live-id"]')?.content || '';

// サーバ（lib/sse.js の broadcast / helloChunk）が送るイベントの型。最後に受け取った id は、
// ページがリスナーを登録しているかどうかに関係なく、この全型で記録する。型を増やしたらここにも足す
const EVENT_TYPES = ['hello', 'reload', 'rich'];

function recordId(e) {
  if (e.lastEventId) lastEventId = e.lastEventId;
}

function connect() {
  const since = lastEventId ? '?since=' + encodeURIComponent(lastEventId) : '';
  source = new EventSource('/api/live' + since);
  for (const type of EVENT_TYPES) source.addEventListener(type, recordId);
  for (const [type, fn] of listeners) source.addEventListener(type, fn);
}

function disconnect() {
  if (source) source.close();
  source = null;
}

// 表示中なら接続し、裏に回っていれば閉じる
function sync() {
  if (document.visibilityState === 'visible') {
    // HTTP エラーなどで EventSource が自動再接続をあきらめた（CLOSED）ときも、表に戻ったらつなぎ直す
    if (source && source.readyState === EventSource.CLOSED) disconnect();
    if (!source) connect();
  } else {
    disconnect();
  }
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
  // 裏で開いたタブ（Cmd+クリックなど）は、表示されるまで接続しない
  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', disconnect);
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) sync();
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
