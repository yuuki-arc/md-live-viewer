// 待受アドレスとアクセス元の判定。server.js から切り出してユニットテスト可能にしている。

// vault の内容や絶対パス（/api/vaults）を返すため、既定ではループバックのみで待ち受ける。
// 汎用の HOST は zsh などがマシンのホスト名を入れていることがあり、意図せず LAN 側で
// 待ち受けてしまうため読まない。MLV_CONFIG と同じくプロジェクト固有の名前にする
export function resolveBindHost(env) {
  return env.MLV_HOST || '127.0.0.1';
}

const LOOPBACK_BIND = new Set(['127.0.0.1', '::1', 'localhost']);
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Host ヘッダ（"name:port" / "[v6]:port"）からポートを除いたホスト名
function hostnameOf(hostHeader) {
  const m = /^(\[[^\]]*\]|[^:]*)(?::\d+)?$/.exec(String(hostHeader || ''));
  return m ? m[1].toLowerCase() : '';
}

// ループバック待受でも、DNS リバインディング（攻撃者のドメインを 127.0.0.1 に向け直す）
// を使うと他サイトの JS から読めてしまうため Host を localhost 系に限る。
// また他サイトからの POST（/api/switch など）を防ぐため、Origin があれば同一オリジンに限る。
// MLV_HOST で LAN に公開している場合はアクセス名が分からないので Host は問わない
export function isAllowedRequest({ host, origin }, bindHost) {
  if (LOOPBACK_BIND.has(bindHost) && !LOOPBACK_NAMES.has(hostnameOf(host))) return false;
  if (origin !== undefined && origin !== null) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    if (originHost.toLowerCase() !== String(host || '').toLowerCase()) return false;
  }
  return true;
}

export function formatServerUrl(host, port) {
  const h = host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}/`;
}
