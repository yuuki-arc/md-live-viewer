// config.json の表示対象ディレクトリ一覧を読む。正式なキーは sources。
// Obsidian の vault を並べるなら vaults と書くのが自然なので、vaults も正式な別名として受け付ける
// （両方あれば sources を優先する）
export function readSources(cfg) {
  if (Array.isArray(cfg?.sources)) return cfg.sources;
  if (Array.isArray(cfg?.vaults)) return cfg.vaults;
  return [];
}
