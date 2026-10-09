// 待受アドレスとアクセス元の判定。server.js から切り出してユニットテスト可能にしている。

// vault の内容や絶対パス（/api/vaults）を返すため、既定ではループバックのみで待ち受ける。
// 汎用の HOST は zsh などがマシンのホスト名を入れていることがあり、意図せず LAN 側で
// 待ち受けてしまうため読まない。MLV_CONFIG と同じくプロジェクト固有の名前にする
export function resolveBindHost(env) {
  return env.MLV_HOST || '127.0.0.1';
}

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

// 127.0.0.0/8・::1・IPv4 射影の 127.x を、大文字小文字や角括弧・省略の有無を問わず判定する。
// 表記揺れでループバックと判定できないと Host 検証がスキップされてしまうため
function isLoopbackBind(bindHost) {
  const b = String(bindHost).toLowerCase().replace(/^\[|\]$/g, '');
  return b === 'localhost' || b === '::1' || b === '0:0:0:0:0:0:0:1' ||
    /^127\./.test(b) || /^::ffff:127\./.test(b);
}

// 待受アドレスを Host ヘッダのホスト名と同じ表記（小文字、IPv6 は角括弧付き）にする。
// 127.0.0.2 などで待ち受けたとき、そのアドレス自身でのアクセスを許可するため
function bindAsHostName(bindHost) {
  const b = String(bindHost).toLowerCase().replace(/^\[|\]$/g, '');
  return b.includes(':') ? `[${b}]` : b;
}

// Host ヘッダ（"name:port" / "[v6]:port"）をホスト名とポートに分ける。ポート省略時は 80
function parseHostHeader(hostHeader) {
  const m = /^(\[[^\]]*\]|[^:]*)(?::(\d+))?$/.exec(String(hostHeader || ''));
  return m ? { name: m[1].toLowerCase(), port: m[2] || '80' } : { name: '', port: '' };
}

// ループバック待受でも、DNS リバインディング（攻撃者のドメインを 127.0.0.1 に向け直す）
// を使うと他サイトの JS から読めてしまうため Host を localhost 系に限る。
// また他サイトからの POST（/api/switch など）を防ぐため、Origin があれば同一オリジンに限る。
// MLV_HOST で LAN に公開している場合はアクセス名が分からないので Host は問わない
export function isAllowedRequest({ host, origin }, bindHost) {
  const h = parseHostHeader(host);
  if (isLoopbackBind(bindHost) && !LOOPBACK_NAMES.has(h.name) && h.name !== bindAsHostName(bindHost)) {
    return false;
  }
  if (origin !== undefined && origin !== null) {
    let o;
    try {
      o = new URL(origin);
    } catch {
      return false;
    }
    // サーバは http のみ。スキーム・ホスト名・ポート（既定 80 を補完）がすべて一致するときだけ同一オリジン
    if (o.protocol !== 'http:') return false;
    if (o.hostname.toLowerCase() !== h.name || (o.port || '80') !== h.port) return false;
  }
  return true;
}

export function formatServerUrl(host, port) {
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${h}:${port}/`;
}
