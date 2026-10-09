import chokidar from 'chokidar';
import { stat as fsStat } from 'node:fs/promises';
import path from 'node:path';
import { state } from './state.js';
import { broadcast } from './sse.js';
import { invalidate as invalidateRender } from './render.js';
import { buildDoc } from './search.js';

// URL 変換（relPathToUrl）は .md を大文字小文字無視で除去しているので、判定もそれに揃える
export function isMarkdown(p) {
  return /\.md$/i.test(p);
}

function isIgnored(absPath, vaultPath) {
  const rel = path.relative(vaultPath, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const segs = rel.split(path.sep);
  if (segs.some((s) => state.excludedDirs.has(s))) return true;
  if (segs.length === 1 && state.excludedFiles.has(segs[0])) return true;
  return false;
}

function relPathToUrl(relPath) {
  const noExt = relPath.replace(/\.md$/i, '');
  const segs = noExt.split(path.sep).filter(Boolean);
  return '/' + segs.join('/') + '/';
}

function insertIntoTree(relPath, url) {
  const noExt = relPath.replace(/\.md$/i, '');
  const segs = noExt.split(path.sep).filter(Boolean);
  let node = state.tree;
  for (const seg of segs) {
    if (!node.children.has(seg)) {
      node.children.set(seg, { name: seg, url: null, children: new Map() });
    }
    node = node.children.get(seg);
  }
  node.url = url;
}

function removeFromTree(relPath) {
  const noExt = relPath.replace(/\.md$/i, '');
  const segs = noExt.split(path.sep).filter(Boolean);
  const stack = [state.tree];
  let node = state.tree;
  for (const seg of segs) {
    const next = node.children.get(seg);
    if (!next) return;
    stack.push(next);
    node = next;
  }
  stack[stack.length - 1].url = null;
  for (let i = segs.length - 1; i >= 0; i--) {
    const self = stack[i + 1];
    if (self.children.size === 0 && !self.url) {
      stack[i].children.delete(segs[i]);
    } else {
      break;
    }
  }
}

async function addOrUpdate(absPath, vaultPath) {
  let st;
  try {
    st = await fsStat(absPath);
  } catch {
    return;
  }
  const rel = path.relative(vaultPath, absPath);
  const url = relPathToUrl(rel);
  state.index.set(url, { filePath: absPath, mtime: st.mtimeMs });
  insertIntoTree(rel, url);
  if (state.searchIndex.has(url)) state.searchIndex.discard(url);
  state.searchIndex.add(buildDoc(url));
}

function remove(absPath, vaultPath) {
  const rel = path.relative(vaultPath, absPath);
  const url = relPathToUrl(rel);
  state.index.delete(url);
  removeFromTree(rel);
  if (state.searchIndex.has(url)) state.searchIndex.discard(url);
  invalidateRender(absPath);
}

export async function load(vaultPath) {
  state.currentVault = vaultPath;

  return new Promise((resolve, reject) => {
    const watcher = chokidar.watch(vaultPath, {
      ignored: (p) => isIgnored(p, vaultPath),
      ignoreInitial: false,
      persistent: true,
    });

    const pending = [];
    let ready = false;

    watcher.on('add', (p) => {
      if (!isMarkdown(p)) return;
      const task = addOrUpdate(p, vaultPath);
      if (!ready) {
        // 1 ファイルの失敗で Promise.all(pending) が reject すると load() が終わらず、
        // 起動も vault 切替も止まってしまう。失敗はログに留めて残りのファイルで構築する
        pending.push(task.catch((err) => console.error('[indexer] 初回走査で反映に失敗:', p, err)));
        return;
      }
      // 起動後に増えたファイルは、開いているページのサイドバーに出すため全体をリロードさせる
      // （unlink と対称。初回走査中は大量に発火するので通知しない）
      task
        .then(() => broadcast('reload', { scope: 'all' }))
        .catch((err) => console.error('[indexer] add の反映に失敗:', p, err));
    });

    // イベントハンドラ内の reject は誰も待っていないため、捕捉しないと
    // unhandled rejection でプロセスごと終了する。1 ファイルの失敗はログに留める
    watcher.on('change', (p) => {
      if (!isMarkdown(p)) return;
      addOrUpdate(p, vaultPath)
        .then(() => {
          invalidateRender(p);
          broadcast('reload', { scope: relPathToUrl(path.relative(vaultPath, p)) });
        })
        .catch((err) => console.error('[indexer] change の反映に失敗:', p, err));
    });

    watcher.on('unlink', (p) => {
      if (!isMarkdown(p)) return;
      remove(p, vaultPath);
      broadcast('reload', { scope: 'all' });
    });

    watcher.on('ready', async () => {
      await Promise.all(pending);
      ready = true;
      state.watcher = watcher;
      resolve();
    });

    watcher.on('error', (err) => {
      console.error('[chokidar]', err);
      reject(err);
    });
  });
}

export async function stop() {
  if (state.watcher) {
    await state.watcher.close();
    state.watcher = null;
  }
}
