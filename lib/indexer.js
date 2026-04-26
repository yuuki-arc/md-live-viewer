import chokidar from 'chokidar';
import { stat as fsStat } from 'node:fs/promises';
import path from 'node:path';
import { state } from './state.js';
import { broadcast } from './sse.js';
import { invalidate as invalidateRender } from './render.js';

const EXCLUDED_DIRS = new Set([
  '.raw',
  '_templates',
  '.obsidian',
  'Excalidraw',
  '.git',
  '.claude',
  'node_modules',
]);

const EXCLUDED_ROOT_FILES = new Set([
  'CLAUDE.md',
  'README.md',
  'karpathy-llm-wiki.md',
  '2026-04-22.md',
]);

function isIgnored(absPath, vaultPath) {
  const rel = path.relative(vaultPath, absPath);
  if (!rel || rel.startsWith('..')) return false;
  const segs = rel.split(path.sep);
  if (segs.some((s) => EXCLUDED_DIRS.has(s))) return true;
  if (segs.length === 1 && EXCLUDED_ROOT_FILES.has(segs[0])) return true;
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
}

function remove(absPath, vaultPath) {
  const rel = path.relative(vaultPath, absPath);
  const url = relPathToUrl(rel);
  state.index.delete(url);
  removeFromTree(rel);
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
      if (!p.endsWith('.md')) return;
      const task = addOrUpdate(p, vaultPath);
      if (!ready) pending.push(task);
    });

    watcher.on('change', async (p) => {
      if (!p.endsWith('.md')) return;
      await addOrUpdate(p, vaultPath);
      invalidateRender(p);
      const rel = path.relative(vaultPath, p);
      broadcast('reload', { scope: relPathToUrl(rel) });
    });

    watcher.on('unlink', (p) => {
      if (!p.endsWith('.md')) return;
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
