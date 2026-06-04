import { state } from './state.js';

const FUZZY = 0.2;
const PREFIX = true;

export function search(query, limit = 50) {
  const q = (query || '').trim();
  if (!q) return { query: q, results: [] };

  const hits = state.searchIndex.search(q, {
    fuzzy: FUZZY,
    prefix: PREFIX,
    boost: { name: 2 },
    combineWith: 'AND',
  });

  const results = hits.slice(0, limit).map((hit) => ({
    url: hit.url,
    name: hit.path,
    score: hit.score,
  }));

  return { query: q, results };
}

export function buildDoc(url) {
  const decoded = decodeURIComponent(url).replace(/^\/|\/$/g, '');
  const segs = decoded.split('/').filter(Boolean);
  const name = segs[segs.length - 1] || decoded;
  return { url, name, path: decoded };
}
