import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import MarkdownIt from 'markdown-it';
import wikilinks from 'markdown-it-wikilinks';
import matter from 'gray-matter';
import { state } from './state.js';
import { escapeHtml } from './escape.js';

// Obsidian callout（> [!type] Title）。行スキャンの前処理ではなく
// markdown-it のトークン変換として実装する。blockquote として正しく
// パースされたものだけを対象にするため、コードフェンス・raw HTML ブロック・
// リスト内などの文脈判断はすべて本体パーサに任せられる
const CALLOUT_MARKER_RE = /^\[!([A-Za-z0-9_-]+)\][+-]?[ \t]*(.*)$/;

function makeParagraph(state, content, level) {
  const open = new state.Token('paragraph_open', 'p', 1);
  open.level = level;
  open.block = true;
  const inline = new state.Token('inline', '', 0);
  inline.content = content;
  inline.level = level + 1;
  inline.children = [];
  inline.block = true;
  const close = new state.Token('paragraph_close', 'p', -1);
  close.level = level;
  close.block = true;
  return [open, inline, close];
}

function makeHtmlToken(state, content) {
  const t = new state.Token('html_block', '', 0);
  t.content = content;
  t.block = true;
  return t;
}

// blockquote の中身（open/close を除くトークン列）を callout の
// トークン列に変換する。callout でなければ null
function transformCallout(state, inner, level) {
  const direct = level + 1;
  const first = inner[0];
  if (!first || first.type !== 'paragraph_open' || first.level !== direct) return null;
  const firstInline = inner[1];
  if (!firstInline || firstInline.type !== 'inline') return null;
  if (!CALLOUT_MARKER_RE.test(firstInline.content.split('\n')[0])) return null;

  // 直下の段落を marker 行で分割する（1 つの段落に複数 callout が
  // 連続している場合に備える）
  const expanded = [];
  for (let i = 0; i < inner.length; i++) {
    const t = inner[i];
    if (
      t.type === 'paragraph_open' && t.level === direct &&
      inner[i + 1] && inner[i + 1].type === 'inline'
    ) {
      const lines = inner[i + 1].content.split('\n');
      const chunks = [];
      let cur = [];
      for (const line of lines) {
        if (cur.length > 0 && CALLOUT_MARKER_RE.test(line)) {
          chunks.push(cur);
          cur = [];
        }
        cur.push(line);
      }
      chunks.push(cur);
      for (const chunk of chunks) {
        expanded.push(...makeParagraph(state, chunk.join('\n'), direct));
      }
      i += 2;
    } else {
      expanded.push(t);
    }
  }

  // marker 段落ごとに segment（= 1 つの callout）へ分ける
  const segments = [];
  let seg = null;
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i];
    const inline = expanded[i + 1];
    const m =
      t.type === 'paragraph_open' && t.level === direct &&
      inline && inline.type === 'inline'
        ? inline.content.split('\n')[0].match(CALLOUT_MARKER_RE)
        : null;
    if (m) {
      seg = { type: m[1].toLowerCase(), title: m[2].trim(), body: [] };
      segments.push(seg);
      const rest = inline.content.split('\n').slice(1).join('\n');
      if (rest.trim()) seg.body.push(...makeParagraph(state, rest, direct));
      i += 2;
    } else {
      seg.body.push(t);
    }
  }

  const out = [];
  for (const s of segments) {
    const title = s.title || (s.type.charAt(0).toUpperCase() + s.type.slice(1));
    out.push(makeHtmlToken(
      state,
      `<aside class="callout callout-${s.type}">` +
        `<div class="callout-title">${escapeHtml(title)}</div>` +
        `<div class="callout-body">`
    ));
    out.push(...s.body);
    out.push(makeHtmlToken(state, '</div></aside>'));
  }
  return out;
}

function obsidianCallouts(mdInstance) {
  // block ルールの後・inline ルールの前に走らせる。この時点では
  // inline トークンの content が未パースの生テキストなので、
  // marker の検査・除去・段落分割を安全に行える
  mdInstance.core.ruler.after('block', 'obsidian_callouts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      let close = -1;
      for (let j = i + 1, depth = 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        else if (tokens[j].type === 'blockquote_close' && --depth === 0) {
          close = j;
          break;
        }
      }
      if (close === -1) continue;
      const replacement = transformCallout(
        state,
        tokens.slice(i + 1, close),
        tokens[i].level
      );
      if (!replacement) continue;
      tokens.splice(i, close - i + 1, ...replacement);
      // 置き換えた範囲の内側（ネストした callout）は後続の走査で処理される
    }
  });
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
})
  .use(wikilinks({
    baseURL: '/',
    uriSuffix: '/',
    makeAllLinksAbsolute: true,
    htmlAttributes: { class: 'wikilink' },
    postProcessPageName: (s) => encodeURIComponent(s.trim()),
  }))
  .use(obsidianCallouts);

function deriveTitle({ frontmatter, filePath, body }) {
  if (frontmatter && typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }
  const h1 = body.match(/^#\s+(.+?)\s*$/m);
  if (h1) return h1[1].trim();
  return basename(filePath).replace(/\.md$/i, '');
}

export function render(filePath) {
  const st = statSync(filePath);
  const mtime = st.mtimeMs;
  const key = `${filePath}:${mtime}`;
  const cached = state.lru.get(key);
  if (cached) return cached;

  const raw = readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  const frontmatter = parsed.data || {};
  const body = parsed.content || '';
  const html = md.render(body);
  const title = deriveTitle({ frontmatter, filePath, body });

  const result = { html, title, frontmatter, mtime };
  state.lru.set(key, result);
  return result;
}

export function invalidate(filePath) {
  for (const key of state.lru.keys()) {
    if (key.startsWith(filePath + ':')) state.lru.delete(key);
  }
}
