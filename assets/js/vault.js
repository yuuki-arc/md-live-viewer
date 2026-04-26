(function () {
  var KEY = 'md-live-viewer-source';
  var sel = document.getElementById('vault-select');
  if (!sel) return;

  async function switchTo(slug) {
    var r = await fetch('/api/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug }),
    });
    return r.ok;
  }

  async function init() {
    try {
      var r = await fetch('/api/vaults');
      var data = await r.json();
      var vaults = data.vaults || [];

      sel.innerHTML = '';
      vaults.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.slug;
        opt.textContent = v.label;
        sel.appendChild(opt);
      });

      var stored = localStorage.getItem(KEY);
      var storedValid = stored && vaults.some(function (v) { return v.slug === stored; });

      if (storedValid && stored !== data.current) {
        sel.disabled = true;
        var ok = await switchTo(stored);
        if (ok) {
          location.href = '/';
          return;
        }
        sel.disabled = false;
      }

      sel.value = storedValid ? stored : data.current;
    } catch (_) {}
  }

  sel.addEventListener('change', async function (e) {
    var slug = e.target.value;
    localStorage.setItem(KEY, slug);
    sel.disabled = true;
    try {
      var ok = await switchTo(slug);
      if (ok) {
        location.href = '/';
      }
    } finally {
      sel.disabled = false;
    }
  });

  init();
})();
