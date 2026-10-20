import { randomBytes } from 'node:crypto';
import { state } from './state.js';

// ブラウザは同じホストへの接続を 6 本までに制限するので、裏に回ったタブは SSE を閉じる
// （assets/js/live.js）。閉じている間に流れたイベントを、つなぎ直したときに送り直せるよう
// id を付けて直近の分を覚えておく。id は「起動ごとの値-連番」で、再起動前の id は判定できない
export const BOOT_ID = randomBytes(4).toString('hex');

// 覚えておく件数。超えた分を取りこぼしたクライアントには全ページの再読み込みを送る
const HISTORY_SIZE = 200;
const RELOAD_ALL = 'event: reload\ndata: {"scope":"all"}\n\n';

let seq = 0;
const history = [];

export function addClient(client) {
  state.sseClients.add(client);
  return () => state.sseClients.delete(client);
}

export function broadcast(event, data) {
  seq += 1;
  const payload = JSON.stringify(data ?? {});
  const chunk = `id: ${BOOT_ID}-${seq}\nevent: ${event}\ndata: ${payload}\n\n`;
  history.push({ seq, chunk });
  if (history.length > HISTORY_SIZE) history.shift();
  for (const client of state.sseClients) {
    try {
      client.write(chunk);
    } catch {
      state.sseClients.delete(client);
    }
  }
}

// 接続したクライアントに今の位置を知らせる。まだイベントを 1 つも受け取っていないタブでも、
// 裏に回って閉じたあと ?since= で取りこぼしを求められるようにする
export function helloChunk() {
  return `id: ${currentId()}\nevent: hello\ndata: {}\n\n`;
}

// 今の位置。ページの HTML にも埋め込み（lib/template.js の liveId）、SSE がつながる前の変更や
// 裏で開いて表示する前の変更も、最初の接続の ?since= で取りこぼさないようにする
export function currentId() {
  return `${BOOT_ID}-${seq}`;
}

// クライアントが最後に受け取った id。assets/js/live.js はつなぎ直すとき ?since= で渡すが、
// EventSource の自動再接続（瞬断・スリープ復帰など）は最初の URL のまま、最新の id を
// Last-Event-ID ヘッダで送る。URL に残った古い since を使うと受け取り済みの分を送り直してしまうので、
// ヘッダがあればそちらを使う
export function lastIdOf({ since, header }) {
  return header || since || '';
}

// lastId（クライアントが最後に受け取った id）より後のイベント。初回の接続（lastId なし）は何も送らない。
// 別の起動の id や、覚えている範囲より古い id は取りこぼしを判定できないので、全ページを読み込み直させる
export function missedSince(lastId) {
  if (!lastId) return [];
  const m = /^([0-9a-f]+)-(\d+)$/.exec(String(lastId));
  if (!m || m[1] !== BOOT_ID) return [RELOAD_ALL];
  const last = Number(m[2]);
  if (last >= seq) return [];
  if (history.length === 0 || history[0].seq > last + 1) return [RELOAD_ALL];
  return history.filter((e) => e.seq > last).map((e) => e.chunk);
}
