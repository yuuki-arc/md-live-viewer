import { state } from './state.js';

export function search(query, limit = 50) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { query: q, results: [] };

  const results = [];
  for (const [url] of state.index) {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (decoded.includes(q)) {
      results.push({
        url,
        name: decodeURIComponent(url).replace(/^\/|\/$/g, ''),
      });
      if (results.length >= limit) break;
    }
  }
  return { query: q, results };
}
