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
import { addClient, broadcast, missedSince, helloChunk } from './lib/sse.js';
import { rawPathToUrl, toRawHref } from './lib/raw.js';
import { escapeHtml } from './lib/escape.js';
import { encodePath, decodePath } from './assets/js/url-path.js';
import { resolveBindHost, formatServerUrl, isAllowedRequest } from './lib/host.js';
import { createSerialQueue } from './lib/serial.js';
import { resolveRichConfig } from './lib/rich-config.js';
import { createRichStore, hashSource } from './lib/rich-cache.js';
import { createRichJobs } from './lib/rich-jobs.js';
import { createGenerator } from './lib/rich-generator.js';
import { richPathToUrl, decorateRichHtml, RICH_CSP } from './lib/rich-page.js';
import { loadThemes } from './lib/rich-theme.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
// 既定は ROOT/config.json。E2E など別 vault を注入したい場合のみ
// MLV_CONFIG で差し替える。
const CONFIG_PATH = process.env.MLV_CONFIG
  ? path.resolve(process.env.MLV_CONFIG)
  : path.join(ROOT, 'config.json');
// ログで「既定の config.json なのか MLV_CONFIG 指定なのか」を区別するため。
const CONFIG_SOURCE = process.env.MLV_CONFIG ? ' (from MLV_CONFIG)' : '';
const PORT = Number(process.env.PORT) || 7777;
const HOST = resolveBindHost(process.env);

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
      console.log(`[md-live-viewer] config not found at ${CONFIG_PATH}${CONFIG_SOURCE}`);
      return false;
    }
    throw err;
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    console.warn(`[md-live-viewer] config at ${CONFIG_PATH}${CONFIG_SOURCE} is not valid JSON: ${err.message}`);
    return false;
  }
  state.vaults = Array.isArray(cfg.vaults) ? cfg.vaults : [];
  state.excludedDirs = new Set(
    Array.isArray(cfg.excludedDirs) ? cfg.excludedDirs : ['.git']
  );
  state.excludedFiles = new Set(
    Array.isArray(cfg.excludedFiles) ? cfg.excludedFiles : []
  );
  loadRich(cfg.rich);
  if (state.vaults.length === 0) {
    console.warn('[md-live-viewer] config.json has no vaults');
    return false;
  }
  const current = state.vaults.find((v) => v.slug === cfg.current) || state.vaults[0];
  state.currentSlug = current.slug;
  state.currentVault = current.path;
  return true;
}

// リッチ HTML 表示（Rich モード）。設定が不正でも Markdown 表示は使えるよう、
// 起動は止めずに理由を保持して /api/rich で返す
const rich = { store: null, generator: null, error: null };
const richJobs = createRichJobs({
  onSettled: (key, status) => {
    const [, url] = key.split('\0');
    broadcast('rich', { scope: url, ...status });
  },
});

function loadRich(raw) {
  try {
    const cfg = resolveRichConfig(raw, ROOT);
    rich.store = createRichStore(cfg.cacheDir);
    rich.generator = createGenerator(cfg.generator, { timeoutMs: cfg.timeoutMs });
    rich.error = null;
  } catch (err) {
    rich.store = null;
    rich.generator = null;
    rich.error = err.message;
    console.warn(`[md-live-viewer] rich view disabled: ${err.message}`);
  }
}

function richKey(url) {
  return `${state.currentSlug}\0${url}`;
}

function richStatus(url, entry) {
  if (!rich.store) return { available: false, error: rich.error };
  const cached = rich.store.read(state.currentSlug, url);
  let stale = false;
  if (cached) {
    try {
      stale = hashSource(readFileSync(entry.filePath, 'utf8')) !== cached.meta.sourceHash;
    } catch {
      stale = false;
    }
  }
  return {
    available: true,
    generator: rich.generator.name,
    exists: Boolean(cached),
    stale,
    generatedAt: cached?.meta.generatedAt ?? null,
    generatedBy: cached?.meta.generator ?? null,
    job: richJobs.status(richKey(url)),
  };
}

// ページを返すルートだけが渡す、Markdown / Rich の表示切替（assets/js/rich-view.js が操作する）
const VIEW_PICKER = `<div class="view-picker" role="group" aria-label="表示モード">
  <button type="button" data-view="md" aria-pressed="true">Markdown</button>
  <button type="button" data-view="rich" aria-pressed="false">Rich</button>
</div>`;

function renderIndexBody() {
  const children = treeLib.getChildren('').children;
  const items = children
    .map((c) => {
      const target = c.url
        ? `<a href="${encodePath(c.url)}">${escapeHtml(c.name)}</a>`
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

// c.req.path は decodeURI 相当で、%26(&) %23(#) %25(%) などを復元しない。
// state.index のキーは実ファイル名そのままなので、生のパスをセグメント単位でデコードする。
// 不正なエスケープなら null
function requestPath(c) {
  return decodePath(new URL(c.req.url).pathname);
}

const switchQueue = createSerialQueue();

const app = new Hono();

app.use('*', async (c, next) => {
  const allowed = isAllowedRequest(
    { host: c.req.header('host'), origin: c.req.header('origin') },
    HOST
  );
  if (!allowed) return c.text('Forbidden', 403);
  await next();
});

app.use('/assets/*', serveStatic({ root: ROOT }));

app.get('/_attachments/*', async (c) => {
  if (!state.currentVault) return c.notFound();
  const reqPath = requestPath(c);
  if (reqPath === null) return c.notFound();
  const rel = reqPath.replace(/^\/_attachments\//, '');
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

// 生 Markdown をそのまま返すモード。catch-all より前に登録する必要がある。
// 参照できるのは state.index に載ったファイルだけなので、../ 等は構造的に届かない。
app.get('/_raw/*', (c) => {
  const reqPath = requestPath(c);
  const url = reqPath === null ? null : rawPathToUrl(reqPath);
  if (!url) return c.notFound();
  const entry = state.index.get(url);
  if (!entry) return c.notFound();
  try {
    // render() は html: true でサニタイズしない設計のため、raw 側は
    // nosniff を付けて Markdown 内の生 HTML が描画されないようにする。
    return c.text(readFileSync(entry.filePath, 'utf8'), 200, {
      'X-Content-Type-Options': 'nosniff',
    });
  } catch {
    return c.notFound();
  }
});

// 生成済みのリッチ HTML。sandbox の CSP で隔離して返す（lib/rich-page.js 参照）。
// /_raw/ と同じく state.index に載ったページしか引けない
const RICH_THEMES = loadThemes(path.join(ROOT, 'assets', 'css'));

app.get('/_rich/*', (c) => {
  const reqPath = requestPath(c);
  const url = reqPath === null ? null : richPathToUrl(reqPath);
  if (!url || !state.index.has(url) || !rich.store) return c.notFound();
  const cached = rich.store.read(state.currentSlug, url);
  if (!cached) return c.notFound();
  // ?theme= はビューアで選んでいるテーマ（assets/js/rich-view.js が付ける）。知らない名前は無視する
  const themeCss = RICH_THEMES.get(c.req.query('theme') || '');
  return c.html(decorateRichHtml(cached.html, { themeCss }), 200, {
    'Content-Security-Policy': RICH_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
});

app.get('/api/rich', (c) => {
  const url = c.req.query('path') || '';
  const entry = state.index.get(url);
  if (!entry) return c.json({ error: 'not found' }, 404);
  return c.json(richStatus(url, entry));
});

app.post('/api/rich/generate', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const url = body?.path;
  const entry = state.index.get(url);
  if (!entry) return c.json({ error: 'not found' }, 404);
  if (!rich.store) return c.json({ error: rich.error }, 503);

  // 実行時点の vault を固定する。生成中に vault が切り替わっても元の vault のキャッシュに書く
  const slug = state.currentSlug;
  const { store, generator } = rich;
  richJobs.request(richKey(url), async () => {
    // 生成前の内容のハッシュを記録する。生成中に編集されたら、生成後すぐ「古い」と分かる
    const markdown = readFileSync(entry.filePath, 'utf8');
    const title = render(entry.filePath)?.title ?? url;
    const html = await generator.generate({ markdown, title });
    store.write(slug, url, {
      html,
      meta: {
        url,
        sourceHash: hashSource(markdown),
        generatedAt: new Date().toISOString(),
        generator: generator.name,
      },
    });
  });
  return c.json(richStatus(url, entry), 202);
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
    // 切替が重なると、片方の watcher が停止されずに残ったり、別 vault の
    // ファイルが index に混ざったりするため直列化する
    await switchQueue(async () => {
      await indexer.stop();
      resetState();
      state.currentSlug = vault.slug;
      await indexer.load(vault.path);
    });
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
    // 裏に回って閉じていたタブがつなぎ直したとき、閉じている間のイベントを送り直す（?since= は
    // assets/js/live.js が付ける。EventSource の自動再接続では Last-Event-ID ヘッダで届く）。
    // 登録と同じ同期処理の中で求めるので、送り直しと新しいイベントの間に抜けも重複もない
    const missed = [...missedSince(c.req.query('since') || c.req.header('last-event-id')), helloChunk()];
    stream.onAbort(() => {
      closed = true;
      remove();
      if (waker) { waker(); waker = null; }
    });
    try {
      await stream.write(': connected\n\n');
      for (const chunk of missed) await stream.write(chunk);
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
  const reqPath = requestPath(c);
  if (reqPath === null) return c.notFound();
  const url = reqPath.endsWith('/') ? reqPath : reqPath + '/';
  const entry = state.index.get(url);
  if (!entry) return c.notFound();
  const rendered = render(entry.filePath);
  if (!rendered) return c.notFound();
  const { html, title } = rendered;
  const wrapped = wrap({
    title,
    content: html,
    source: state.currentSlug,
    rawLink: `<a class="raw-link" href="${toRawHref(url)}">Raw</a>`,
    viewPicker: VIEW_PICKER,
  });
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
  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
    console.log(`[md-live-viewer] Server at ${formatServerUrl(HOST, info.port)}`);
  });
})();
