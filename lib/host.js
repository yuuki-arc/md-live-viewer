// 待受アドレスとアクセス元の判定。server.js から切り出してユニットテスト可能にしている。

// vault の内容や絶対パス（/api/vaults）を返すため、既定ではループバックのみで待ち受ける。
// 汎用の HOST は zsh などがマシンのホスト名を入れていることがあり、意図せず LAN 側で
// 待ち受けてしまうため読まない。MLV_CONFIG と同じくプロジェクト固有の名前にする
export function resolveBindHost(env) {
  return env.MLV_HOST || '127.0.0.1';
}

export function formatServerUrl(host, port) {
  const h = host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}/`;
}
