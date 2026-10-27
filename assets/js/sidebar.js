import { ancestorSlugs } from './tree-path.js';
import { encodePath, decodePath } from './url-path.js';

const tree = document.getElementById('sidebar-tree');
const search = document.getElementById('sidebar-search');
const sortSelect = document.getElementById('sidebar-sort');

const metaSlug = document.querySelector('meta[name="source-slug"]');
const SLUG = metaSlug ? metaSlug.getAttribute('content') || '' : '';
const STORAGE_KEY = 'md-live-viewer-open:' + SLUG;
// tree の url はデコード済み実ファイル名。location.pathname はエンコード済み
// なので、突き合わせ前にデコードして揃える。逆に href に入れるときはエンコードする。
const CURRENT_PATH = decodePath(location.pathname) ?? location.pathname;

function loadOpenSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

// 検索文字列。同じ検索結果から次々にページを開けるよう、ページを移動しても残す。
// タブごとに別の検索をしたいので sessionStorage に置き、vault ごとに分ける
const SEARCH_KEY = 'md-live-viewer-search:' + SLUG;

function loadQuery() {
  try {
    return sessionStorage.getItem(SEARCH_KEY) || '';
  } catch (_) {
    return '';
  }
}
function saveQuery(q) {
  try {
    if (q) sessionStorage.setItem(SEARCH_KEY, q);
    else sessionStorage.removeItem(SEARCH_KEY);
  } catch (_) {}
}

// 検索結果の並び順（score: 関連度順 / path: パス順）。好みの問題なので vault やタブで分けず、
// 選んだものを次からの既定にする
const SORT_KEY = 'md-live-viewer-search-sort';
const SORTS = ['score', 'path'];

function loadSort() {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORTS.includes(v) ? v : 'score';
  } catch (_) {
    return 'score';
  }
}
function saveSort(v) {
  try {
    localStorage.setItem(SORT_KEY, v);
  } catch (_) {}
}

// ユーザーが明示的に開いた details の slug（localStorage に永続化）。
const openSet = loadOpenSet();
// 祖先の自動展開で開いた slug。手動展開と区別し、これらは永続化しない
// （セッション一時）。toggle が非同期発火するため、open 設定前に記録する。
const autoOpened = new Set();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 短いバックオフ付きでリトライする。dev では node --watch の再起動で
// 一瞬サーバが落ちることがあり、その窓と reload が重なると初回取得が
// 失敗してツリーが空のままになるため、自己回復させる。
async function fetchJson(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('GET ' + url + ' ' + r.status);
      return await r.json();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await delay(150 * 2 ** i);
    }
  }
  throw lastErr;
}

function fetchTree(path) {
  return fetchJson('/api/tree?path=' + encodeURIComponent(path));
}

// details の子をフェッチ＆描画する。toggle 経由でも祖先展開経由でも
// 同じ Promise を共有し、二重フェッチを防ぐ。失敗した Promise はキャッシュ
// せず、開き直したときに再試行できるようにする。
function ensureLoaded(det, ul) {
  if (det._loadPromise) return det._loadPromise;
  det._loadPromise = (async function () {
    const data = await fetchTree(det.dataset.path);
    renderChildren(ul, data.children);
  })().catch((err) => {
    det._loadPromise = null;
    throw err;
  });
  return det._loadPromise;
}

function findChildDetails(parentUl, slug) {
  // renderChildren では details は常に li の最初の子。
  for (const li of parentUl.children) {
    const det = li.firstElementChild;
    if (det && det.tagName === 'DETAILS' && det.dataset.path === slug) return det;
  }
  return null;
}

function renderChildren(parent, children) {
  parent.innerHTML = '';
  children.forEach(function (child) {
    const li = document.createElement('li');
    if (child.isDir) {
      const det = document.createElement('details');
      det.dataset.path = child.slug;
      const sum = document.createElement('summary');
      sum.textContent = child.name;
      if (child.url) {
        const a = document.createElement('a');
        a.href = encodePath(child.url);
        a.className = 'dir-self';
        a.textContent = '·';
        a.title = 'open ' + child.name;
        a.addEventListener('click', function (e) { e.stopPropagation(); });
        sum.appendChild(document.createTextNode(' '));
        sum.appendChild(a);
      }
      det.appendChild(sum);
      const ul = document.createElement('ul');
      det.appendChild(ul);
      det.addEventListener('toggle', function () {
        if (det.open) {
          // 祖先自動展開で開いたものはセッション一時とし永続化しない。
          if (!autoOpened.has(det.dataset.path)) {
            openSet.add(det.dataset.path);
            saveOpenSet(openSet);
          }
          ensureLoaded(det, ul);
        } else {
          autoOpened.delete(det.dataset.path);
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
      const link = document.createElement('a');
      link.href = encodePath(child.url);
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
// 遅延ロードして現在ページをツリー上に可視化する。展開は一時的で
// localStorage には保存しない（ユーザーの手動開閉状態を上書きしない）。
// seq（showFullTree の viewSeq）が古くなったら、途中で検索結果に差し替わっているので止める。
// 切り離された古いツリーを取得し続けたり、検索結果の中へ勝手にスクロールしたりしない
async function expandToCurrent(seq) {
  const slugs = ancestorSlugs(location.pathname);
  let parentUl = tree;
  for (const slug of slugs) {
    if (seq !== viewSeq) return;
    const det = findChildDetails(parentUl, slug);
    if (!det) {
      console.warn('[sidebar] 祖先ディレクトリが見つからず自動展開を中断:', slug);
      return;
    }
    const ul = det.querySelector(':scope > ul');
    if (!openSet.has(slug)) autoOpened.add(slug);
    det.open = true;
    await ensureLoaded(det, ul);
    parentUl = ul;
  }
  if (seq !== viewSeq) return;
  const active = tree.querySelector('a.is-active');
  if (active && active.scrollIntoView) {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function renderTreeError(message, onRetry) {
  tree.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'tree-error';
  li.textContent = message + ' ';
  if (onRetry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tree-error__retry';
    btn.textContent = '再試行';
    btn.addEventListener('click', onRetry);
    li.appendChild(btn);
  }
  tree.appendChild(li);
}

// ツリーと検索結果は同じ #sidebar-tree に描画する。取得が重なったとき（検索をクリアした直後に
// 打ち直す、入力が速いなど）に遅れて届いた古い応答で上書きしないよう、最後に出したものだけを描画する
let viewSeq = 0;

// ルートツリーを描画し、現在ページの祖先まで展開する。初期化と
// 検索クリアの両方から使う。
async function showFullTree() {
  const seq = ++viewSeq;
  try {
    const data = await fetchTree('');
    if (seq !== viewSeq) return;
    renderChildren(tree, data.children);
    await expandToCurrent(seq);
  } catch (err) {
    if (seq !== viewSeq) return;
    console.error('[sidebar] ツリーの読み込みに失敗:', err);
    renderTreeError('ツリーの読み込みに失敗しました。', showFullTree);
  }
}

// ツリーを検索結果のフラットなリストに置き換える。今のページの結果は is-active にする
async function showSearch(q) {
  const seq = ++viewSeq;
  try {
    // ツリーと同じく、node --watch の再起動の瞬間などの一過性の失敗はリトライで自己回復させる
    const sort = sortSelect ? sortSelect.value : 'score';
    const data = await fetchJson('/api/search?q=' + encodeURIComponent(q) + '&sort=' + sort);
    if (seq !== viewSeq) return;
    tree.innerHTML = '';
    // 検索文字列は次のページにも残るので、0 件のときに空白のサイドバーにしない
    if (!(data.results || []).length) {
      const li = document.createElement('li');
      li.className = 'tree-empty';
      li.textContent = '該当するページはありません';
      tree.appendChild(li);
      return;
    }
    (data.results || []).forEach(function (res) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = encodePath(res.url);
      a.textContent = res.name;
      if (res.url === CURRENT_PATH) a.classList.add('is-active');
      li.appendChild(a);
      tree.appendChild(li);
    });
  } catch (err) {
    if (seq !== viewSeq) return;
    console.error('[sidebar] 検索に失敗:', err);
    // ページを開いたときの復元で失敗しても、入力し直さずにやり直せるようにする
    renderTreeError('検索に失敗しました。', () => showSearch(q));
  }
}

if (tree) {
  if (sortSelect) sortSelect.value = loadSort();

  // 前のページで検索していれば、ツリーを出さずに同じ検索結果から始める
  const initialQuery = search ? loadQuery() : '';
  if (initialQuery) {
    search.value = initialQuery;
    showSearch(initialQuery);
  } else {
    showFullTree();
  }

  let searchTimer;
  if (search) {
    search.addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      saveQuery(q);
      // 待っている間に届いた古い応答は、もう描画しない
      ++viewSeq;
      searchTimer = setTimeout(function () {
        if (q) showSearch(q);
        else showFullTree();
      }, 200);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      saveSort(sortSelect.value);
      // 検索中なら今の結果をその場で並べ直す。ツリー表示中は次の検索から効く
      const q = search ? search.value.trim() : '';
      if (q) {
        clearTimeout(searchTimer);
        showSearch(q);
      }
    });
  }
}
