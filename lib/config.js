// config.json の表示対象ディレクトリ一覧を読む。両方あれば sources を優先する
export function readSources(cfg) {
  if (Array.isArray(cfg?.sources)) return cfg.sources;
  if (Array.isArray(cfg?.vaults)) return cfg.vaults;
  return [];
}
