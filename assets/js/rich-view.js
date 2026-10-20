// Markdown / Rich の表示切替。Rich ではサーバが生成したリッチ HTML（/_rich/）を
// sandbox の iframe で表示し、未生成・古い場合は生成ボタンを出す。選択は localStorage に保存する
import { pageKey } from './url-path.js';

const KEY = 'md-live-viewer-view';
const picker = document.querySelector('.view-picker');
const main = document.querySelector('main.prose');
const url = pageKey(location.pathname);

function storedMode() {
  try {
    return localStorage.getItem(KEY) === 'rich' ? 'rich' : 'md';
  } catch (_) {
    return 'md';
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch (_) {}
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

let section = null;
let iframe = null;
let shownVersion = null;
// 状態の取得（SSE の open / rich、生成の POST）が重なっても、最後に出したものだけを描画する。
// 古い応答が後から届いて「生成中…」に戻り、そのまま止まるのを防ぐ
let statusSeq = 0;

async function loadStatus(request, fallback) {
  const seq = ++statusSeq;
  const target = section;
  let s;
  try {
    s = await request();
  } catch (err) {
    s = fallback(err);
  }
  if (seq === statusSeq && target === section) renderStatus(s);
}

async function fetchStatus() {
  const r = await fetch('/api/rich?path=' + encodeURIComponent(url));
  if (!r.ok) throw new Error('status ' + r.status);
  return r.json();
}

async function requestGenerate() {
  const r = await fetch('/api/rich/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: url }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'status ' + r.status);
  return data;
}

function generateButton(label) {
  const btn = el('button', { type: 'button', class: 'rich-generate' }, label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await loadStatus(requestGenerate, (err) => ({ available: true, exists: false, job: { state: 'error', error: err.message } }));
  });
  return btn;
}

function renderStatus(s) {
  if (!section) return;
  const bar = section.querySelector('.rich-bar');
  bar.replaceChildren();

  if (!s.available) {
    bar.append(el('p', { class: 'rich-note rich-note--error' }, 'Rich 表示は無効です: ' + (s.error || '設定を確認してください')));
    return;
  }

  const state = s.job?.state || 'idle';
  const busy = state === 'running' || state === 'queued';

  if (s.exists) {
    bar.append(el('span', { class: 'rich-meta' }, `${formatDate(s.generatedAt)} · ${s.generatedBy}`));
  }
  if (busy) {
    const msg = state === 'queued' ? '他のページの生成待ち…' : `${s.generator} で生成中…（数十秒〜数分かかります）`;
    bar.append(el('span', { class: 'rich-note rich-note--busy' }, msg));
  } else if (state === 'error') {
    bar.append(el('span', { class: 'rich-note rich-note--error' }, '生成に失敗しました: ' + s.job.error));
    bar.append(generateButton('再試行'));
  } else if (!s.exists) {
    bar.append(el('span', { class: 'rich-note' }, `このページのリッチ HTML はまだありません。${s.generator} で生成します。`));
    bar.append(generateButton('生成する'));
  } else {
    if (s.stale) bar.append(el('span', { class: 'rich-note rich-note--stale' }, '元の Markdown が更新されています'));
    bar.append(generateButton('再生成'));
  }

  if (s.exists) {
    // 生成し直したときだけ読み込み直す（状態の更新のたびに iframe をリロードしない）
    const version = s.generatedAt;
    if (!iframe) {
      iframe = el('iframe', {
        class: 'rich-frame',
        title: 'Rich view',
        sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
      });
      section.append(iframe);
    }
    if (shownVersion !== version) {
      shownVersion = version;
      iframe.src = '/_rich' + location.pathname + (location.pathname.endsWith('/') ? '' : '/') + '?v=' + encodeURIComponent(version);
    }
  }
}

function refresh() {
  return loadStatus(fetchStatus, (err) => ({ available: false, error: err.message }));
}

function showRich() {
  if (section) return;
  section = el('section', { class: 'rich-view', 'aria-label': 'Rich view' });
  section.append(el('div', { class: 'rich-bar' }));
  picker.after(section);
  refresh();
}

function hideRich() {
  if (section) section.remove();
  section = null;
  iframe = null;
  shownVersion = null;
}

function applyMode(mode) {
  document.documentElement.classList.toggle('view-rich', mode === 'rich');
  for (const btn of picker.querySelectorAll('button[data-view]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === mode));
  }
  if (mode === 'rich') showRich();
  else hideRich();
}

if (picker && main && url) {
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    saveMode(btn.dataset.view);
    applyMode(btn.dataset.view);
  });

  // sandbox 内の文書から高さの通知を受けて iframe を伸ばす（lib/rich-page.js が差し込むスクリプト）
  window.addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow) return;
    const h = Number(e.data?.height);
    if (e.data?.type !== 'mlv-rich-height' || !(h > 0)) return;
    // box-sizing: border-box なので枠線の分を足さないと、iframe 内に数 px の縦スクロールが出る
    const border = iframe.offsetHeight - iframe.clientHeight;
    iframe.style.height = Math.ceil(h) + border + 'px';
  });

  // 生成の完了・失敗はサーバから SSE で届く
  if (window.EventSource) {
    const es = new EventSource('/api/live');
    // 切断中（サーバ再起動・スリープなど）に届かなかった完了通知を取りこぼさないよう、接続のたびに状態を取り直す
    es.addEventListener('open', () => {
      if (section) refresh();
    });
    es.addEventListener('rich', (e) => {
      try {
        if (JSON.parse(e.data || '{}').scope === url && section) refresh();
      } catch (_) {}
    });
  }

  applyMode(storedMode());
}
