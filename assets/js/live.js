import { pageKey } from './url-path.js';

if (window.EventSource) {
  const es = new EventSource('/api/live');
  es.addEventListener('reload', function (e) {
    try {
      const scope = JSON.parse(e.data || '{}').scope;
      // scope は index のキー形式（デコード済み）、location.pathname はエンコード済み
      // なので、そのまま比べると日本語名などのページで一致しない
      if (scope === 'all' || scope === pageKey(location.pathname)) {
        location.reload();
      }
    } catch (_) {}
  });
}
