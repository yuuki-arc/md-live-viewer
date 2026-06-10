import { ancestorSlugs } from './tree-path.js';

var tree = document.getElementById('sidebar-tree');
var search = document.getElementById('sidebar-search');

var metaSlug = document.querySelector('meta[name="source-slug"]');
var SLUG = metaSlug ? metaSlug.getAttribute('content') || '' : '';
var STORAGE_KEY = 'md-live-viewer-open:' + SLUG;
// tree の url はデコード済み実ファイル名。location.pathname は非 ASCII で
// パーセントエンコードされるため、突き合わせ前にデコードして揃える。
var CURRENT_PATH = (function () {
  try {
    return decodeURIComponent(location.pathname);
  } catch (_) {
    return location.pathname;
  }
})();

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

// details の子をフェッチ＆描画する。toggle 経由でも祖先展開経由でも
// 同じ Promise を共有し、二重フェッチを防ぐ。
function ensureLoaded(det, ul) {
  if (det._loadPromise) return det._loadPromise;
  det._loadPromise = (async function () {
    var data = await fetchTree(det.dataset.path);
    renderChildren(ul, data.children);
  })();
  return det._loadPromise;
}

function findChildDetails(parentUl, slug) {
  var items = parentUl.children;
  for (var i = 0; i < items.length; i++) {
    var det = items[i].querySelector(':scope > details');
    if (det && det.dataset.path === slug) return det;
  }
  return null;
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
      det.addEventListener('toggle', function () {
        if (det.open) {
          openSet.add(det.dataset.path);
          saveOpenSet(openSet);
          ensureLoaded(det, ul);
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
      if (child.url === CURRENT_PATH) {
        link.classList.add('is-active');
      }
      li.appendChild(link);
      parent.appendChild(li);
    }
  });
}

// 現在ページの祖先ディレクトリをルート側から順に開き、各階層を
// 遅延ロードして現在ページをツリー上に可視化する。
async function expandToCurrent() {
  var slugs = ancestorSlugs(location.pathname);
  var parentUl = tree;
  for (var i = 0; i < slugs.length; i++) {
    var det = findChildDetails(parentUl, slugs[i]);
    if (!det) return;
    var ul = det.querySelector(':scope > ul');
    det.open = true;
    openSet.add(slugs[i]);
    await ensureLoaded(det, ul);
    parentUl = ul;
  }
  saveOpenSet(openSet);
  var active = tree.querySelector('a.is-active');
  if (active && active.scrollIntoView) {
    active.scrollIntoView({ block: 'nearest' });
  }
}

async function loadRoot() {
  var data = await fetchTree('');
  renderChildren(tree, data.children);
}

if (tree) {
  (async function () {
    await loadRoot();
    await expandToCurrent();
  })();

  var searchTimer;
  if (search) {
    search.addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var q = e.target.value.trim();
      searchTimer = setTimeout(async function () {
        if (!q) {
          await loadRoot();
          await expandToCurrent();
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
}
