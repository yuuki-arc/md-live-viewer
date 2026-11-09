// config.json の表示対象ディレクトリ一覧（sources）を読む。
// 旧名の vaults もしばらく読めるよう残し、使われていたら legacy: true で知らせる
export function readSources(cfg) {
  if (Array.isArray(cfg?.sources)) return { sources: cfg.sources, legacy: false };
  if (Array.isArray(cfg?.vaults)) return { sources: cfg.vaults, legacy: true };
  return { sources: [], legacy: false };
}
