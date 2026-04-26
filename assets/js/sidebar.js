(function () {
  var tree = document.getElementById('sidebar-tree');
  var search = document.getElementById('sidebar-search');
  if (!tree) return;

  var metaSlug = document.querySelector('meta[name="source-slug"]');
  var SLUG = metaSlug ? metaSlug.getAttribute('content') || '' : '';
  var STORAGE_KEY = 'md-live-viewer-open:' + SLUG;

  function loadOpenSet() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) {
      return new Set();
    }
  }
  function saveOpenSet(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch (_) {}
  }

  var openSet = loadOpenSet();

  async function fetchTree(path) {
    var r = await fetch('/api/tree?path=' + encodeURIComponent(path));
    return r.json();
  }

  function renderChildren(parent, children) {
    parent.innerHTML = '';
    children.forEach(function (child) {
      var li = document.createElement('li');
      if (child.isDir) {
        var det = document.createElement('details');
        det.dataset.path = child.slug;
        var sum = document.createElement('summary');
        sum.textContent = child.name;
        if (child.url) {
          var a = document.createElement('a');
          a.href = child.url;
          a.className = 'dir-self';
          a.textContent = '·';
          a.title = 'open ' + child.name;
          a.addEventListener('click', function (e) { e.stopPropagation(); });
          sum.appendChild(document.createTextNode(' '));
          sum.appendChild(a);
        }
        det.appendChild(sum);
        var ul = document.createElement('ul');
        det.appendChild(ul);
        det.addEventListener('toggle', async function () {
          if (det.open) {
            openSet.add(det.dataset.path);
            saveOpenSet(openSet);
            if (!det.dataset.loaded) {
              det.dataset.loaded = '1';
              var data = await fetchTree(det.dataset.path);
              renderChildren(ul, data.children);
            }
          } else {
            openSet.delete(det.dataset.path);
            saveOpenSet(openSet);
          }
        });
        li.appendChild(det);
        parent.appendChild(li);
        if (openSet.has(child.slug)) {
          det.open = true;
        }
      } else {
        var link = document.createElement('a');
        link.href = child.url;
        link.textContent = child.name;
        if (child.url === location.pathname) {
          link.classList.add('is-active');
        }
        li.appendChild(link);
        parent.appendChild(li);
      }
    });
  }

  async function loadRoot() {
    var data = await fetchTree('');
    renderChildren(tree, data.children);
  }

  loadRoot();

  var searchTimer;
  if (search) {
    search.addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var q = e.target.value.trim();
      searchTimer = setTimeout(async function () {
        if (!q) {
          loadRoot();
          return;
        }
        var r = await fetch('/api/search?q=' + encodeURIComponent(q));
        var data = await r.json();
        tree.innerHTML = '';
        data.results.forEach(function (res) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = res.url;
          a.textContent = res.name;
          li.appendChild(a);
          tree.appendChild(li);
        });
      }, 200);
    });
  }
})();
