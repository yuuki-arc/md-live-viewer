import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import MarkdownIt from 'markdown-it';
import wikilinks from 'markdown-it-wikilinks';
import matter from 'gray-matter';
import { state } from './state.js';

const innerMd = new MarkdownIt({ html: true, linkify: true, breaks: false });

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
}).use(wikilinks({
  baseURL: '/',
  uriSuffix: '/',
  makeAllLinksAbsolute: true,
  htmlAttributes: { class: 'wikilink' },
  postProcessPageName: (s) => encodeURIComponent(s.trim()),
}));

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function preprocessCallouts(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^>\s*\[!([A-Za-z0-9_-]+)\][+-]?\s*(.*)$/);
    if (m) {
      const type = m[1].toLowerCase();
      const titleRaw = m[2].trim();
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const title = titleRaw || (type.charAt(0).toUpperCase() + type.slice(1));
      const bodyHtml = innerMd.render(bodyLines.join('\n')).trim();
      out.push('');
      out.push(
        `<aside class="callout callout-${type}">` +
          `<div class="callout-title">${escapeHtml(title)}</div>` +
          `<div class="callout-body">\n\n${bodyHtml}\n\n</div>` +
        `</aside>`
      );
      out.push('');
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\n');
}

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
  const preprocessed = preprocessCallouts(body);
  const html = md.render(preprocessed);
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
