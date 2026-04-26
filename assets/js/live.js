(function () {
  if (!window.EventSource) return;
  var es = new EventSource('/api/live');
  es.addEventListener('reload', function (e) {
    try {
      var data = JSON.parse(e.data || '{}');
      var scope = data.scope;
      if (scope === 'all' || scope === location.pathname) {
        location.reload();
      }
    } catch (_) {}
  });
})();
