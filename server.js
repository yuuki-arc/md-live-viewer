import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { state, resetState } from './lib/state.js';
import * as indexer from './lib/indexer.js';
import * as treeLib from './lib/tree.js';
import * as searchLib from './lib/search.js';
import { render } from './lib/render.js';
import { wrap } from './lib/template.js';
import { addClient, broadcast } from './lib/sse.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
// 既定は ROOT/config.json。E2E など別 vault を注入したい場合のみ
// MLV_CONFIG で差し替える。
const CONFIG_PATH = process.env.MLV_CONFIG
  ? path.resolve(process.env.MLV_CONFIG)
  : path.join(ROOT, 'config.json');
const PORT = Number(process.env.PORT) || 8082;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function loadConfig() {
  let raw;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[md-live-viewer] config.json not found at ${CONFIG_PATH}`);
      return false;
    }
    throw err;
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    console.warn(`[md-live-viewer] config.json is not valid JSON: ${err.message}`);
    return false;
  }
  state.vaults = Array.isArray(cfg.vaults) ? cfg.vaults : [];
  state.excludedDirs = new Set(
    Array.isArray(cfg.excludedDirs) ? cfg.excludedDirs : ['.git']
  );
  state.excludedFiles = new Set(
    Array.isArray(cfg.excludedFiles) ? cfg.excludedFiles : []
  );
  if (state.vaults.length === 0) {
    console.warn('[md-live-viewer] config.json has no vaults');
    return false;
  }
  const current = state.vaults.find((v) => v.slug === cfg.current) || state.vaults[0];
  state.currentSlug = current.slug;
  state.currentVault = current.path;
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderIndexBody() {
  const children = treeLib.getChildren('').children;
  const items = children
    .map((c) => {
      const target = c.url
        ? `<a href="${encodeURI(c.url)}">${escapeHtml(c.name)}</a>`
        : `<span>${escapeHtml(c.name)}</span>`;
      const tag = c.isDir ? ` <span class="dir-badge">/</span>` : '';
      return `<li>${target}${tag}</li>`;
    })
    .join('\n');
  const header = `<h1>${escapeHtml(state.currentSlug)}</h1>`;
  const help = `<p class="subtle">Open a page from the sidebar or pick one below. Live reload is on.</p>`;
  return `${header}\n${help}\n<ul class="root-list">\n${items}\n</ul>`;
}

function renderWelcomeBody() {
  return `<h1>Welcome</h1>
<p>表示する Markdown ディレクトリがまだ設定されていません。<code>config.json</code> を作成すると、ここにツリーとページが並びます。</p>

<h2>セットアップ</h2>
<pre><code>cp config.example.json config.json
# config.json を開き、対象ディレクトリの絶対パスに書き換える
npm run dev   # サーバを再起動</code></pre>

<h2><code>config.json</code> の最小例</h2>
<pre><code>{
  "current": "notes",
  "vaults": [
    { "slug": "notes", "label": "Notes", "path": "/絶対/パス/markdown/dir" }
  ]
}</code></pre>

<p class="subtle">複数のディレクトリを <code>vaults</code> に並べると、footer の Source select で切り替えられるようになります。</p>`;
}

const app = new Hono();

app.use('/assets/*', serveStatic({ root: ROOT }));

app.get('/_attachments/*', async (c) => {
  if (!state.currentVault) return c.notFound();
  const rel = decodeURIComponent(c.req.path.replace(/^\/_attachments\//, ''));
  const attachmentsRoot = path.resolve(state.currentVault, '_attachments');
  const filePath = path.resolve(attachmentsRoot, rel);
  if (!filePath.startsWith(attachmentsRoot + path.sep) && filePath !== attachmentsRoot) {
    return c.notFound();
  }
  try {
    const st = statSync(filePath);
    if (!st.isFile()) return c.notFound();
    const buf = readFileSync(filePath);
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return c.body(buf, 200, { 'Content-Type': mime });
  } catch {
    return c.notFound();
  }
});

app.get('/api/vaults', (c) => {
  return c.json({
    current: state.currentSlug,
    vaults: state.vaults.map((v) => ({ slug: v.slug, label: v.label, path: v.path })),
  });
});

app.get('/api/tree', (c) => {
  const p = c.req.query('path') || '';
  return c.json(treeLib.getChildren(p));
});

app.get('/api/search', (c) => {
  const q = c.req.query('q') || '';
  return c.json(searchLib.search(q));
});

app.post('/api/switch', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid json' }, 400);
  }
  const slug = body?.slug;
  const vault = state.vaults.find((v) => v.slug === slug);
  if (!vault) return c.json({ ok: false, error: 'unknown slug' }, 400);
  try {
    await indexer.stop();
    resetState();
    state.currentSlug = vault.slug;
    await indexer.load(vault.path);
    broadcast('reload', { scope: 'all' });
    return c.json({ ok: true, slug: vault.slug });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get('/api/live', (c) => {
  return streamSSE(c, async (stream) => {
    const queue = [];
    let waker = null;
    let closed = false;
    const client = {
      write: (chunk) => {
        if (closed) return;
        queue.push(chunk);
        if (waker) { waker(); waker = null; }
      },
    };
    const remove = addClient(client);
    stream.onAbort(() => {
      closed = true;
      remove();
      if (waker) { waker(); waker = null; }
    });
    try {
      await stream.write(': connected\n\n');
      while (!closed) {
        if (queue.length === 0) {
          await new Promise((r) => { waker = r; });
          if (closed) break;
        }
        while (queue.length && !closed) {
          await stream.write(queue.shift());
        }
      }
    } finally {
      remove();
    }
  });
});

app.get('/', (c) => {
  if (!state.currentVault) {
    const html = wrap({
      title: 'Welcome',
      content: renderWelcomeBody(),
      source: '',
    });
    return c.html(html);
  }
  const html = wrap({
    title: state.currentSlug || 'Index',
    content: renderIndexBody(),
    source: state.currentSlug,
  });
  return c.html(html);
});

app.get('*', (c) => {
  const url = c.req.path.endsWith('/') ? c.req.path : c.req.path + '/';
  const entry = state.index.get(url);
  if (!entry) return c.notFound();
  const { html, title } = render(entry.filePath);
  const wrapped = wrap({ title, content: html, source: state.currentSlug });
  return c.html(wrapped);
});

app.notFound((c) => c.text('Not Found', 404));

(async () => {
  const hasConfig = loadConfig();
  if (hasConfig) {
    console.log(`[md-live-viewer] loading source: ${state.currentVault}`);
    const t0 = Date.now();
    try {
      await indexer.load(state.currentVault);
      console.log(`[md-live-viewer] indexed ${state.index.size} pages in ${Date.now() - t0}ms`);
    } catch (err) {
      console.warn(`[md-live-viewer] failed to index source: ${err?.message ?? err}`);
      state.currentVault = null;
      state.currentSlug = null;
    }
  } else {
    console.log('[md-live-viewer] running in welcome mode (no usable config.json)');
  }
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[md-live-viewer] Server at http://localhost:${info.port}/`);
  });
})();
