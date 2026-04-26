import { LRUCache } from 'lru-cache';

export const state = {
  currentVault: null,
  currentSlug: null,
  vaults: [],
  excludedDirs: new Set(),
  excludedFiles: new Set(),
  index: new Map(),
  tree: { children: new Map() },
  lru: new LRUCache({ max: 200 }),
  sseClients: new Set(),
  watcher: null,
};

export function resetState() {
  state.index.clear();
  state.tree = { children: new Map() };
  state.lru.clear();
}
