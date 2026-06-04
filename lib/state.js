import { LRUCache } from 'lru-cache';
import MiniSearch from 'minisearch';

const SEARCH_OPTIONS = {
  fields: ['name', 'path'],
  storeFields: ['url', 'name', 'path'],
  idField: 'url',
  tokenize: (text) => text.split(/[\s/\-_.]+/).filter(Boolean),
  processTerm: (term) => term.toLowerCase(),
};

export function createSearchIndex() {
  return new MiniSearch(SEARCH_OPTIONS);
}

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
  searchIndex: createSearchIndex(),
};

export function resetState() {
  state.index.clear();
  state.tree = { children: new Map() };
  state.lru.clear();
  state.searchIndex = createSearchIndex();
}
