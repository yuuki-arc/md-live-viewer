// Markdown をリッチ HTML に変換する生成器。API キーや従量課金を使わないよう、
// ローカルの claude CLI（ログイン中のサブスクリプション）・Ollama・任意コマンドから選ぶ。
// spawn / fetch / env は差し替え可能にしてユニットテストする
import { spawn as nodeSpawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { DEFAULT_TIMEOUT_MS } from './rich-config.js';

export const SYSTEM_PROMPT = `You convert a Markdown note into a single, self-contained HTML document that is pleasant for a human to read.

Rules:
- Preserve ALL information in the note. Do not drop, summarize away, or invent facts. Keep code blocks verbatim.
- Write in the same language as the note.
- Restructure visually where it helps comprehension: a header with the title and key metadata (from front matter), summary cards, callout boxes for notes/warnings, styled tables, step lists, timelines, collapsible sections (<details>) for long details, and a table of contents for long notes.
- Turn diagrams (e.g. mermaid code blocks) and relationships into inline SVG or HTML/CSS diagrams.
- Use inline <style> only, and inline <script> only if interactivity (tabs, toggles) clearly helps. Do NOT load anything external: no CDN scripts, web fonts, remote images, or network requests. Use system fonts.
- Support both light and dark mode via prefers-color-scheme. Make it responsive.
- Output ONLY the HTML document, starting with <!doctype html>. No explanations, no Markdown code fences.`;

export function buildUserPrompt({ markdown, title }) {
  return `Title: ${title}\n\nConvert the following Markdown note.\n\n<markdown>\n${markdown}\n</markdown>`;
}

// モデルが前置きやコードフェンスを付けても HTML 文書の部分だけを取り出す
export function extractHtml(output) {
  const text = String(output);
  const lower = text.toLowerCase();
  let start = lower.indexOf('<!doctype html');
  if (start === -1) start = lower.indexOf('<html');
  const end = lower.lastIndexOf('</html>');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('generator output does not contain an HTML document');
  }
  return text.slice(start, end + '</html>'.length);
}

function runProcess(spawn, command, args, { input, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    // cwd を一時ディレクトリにして、vault やこのリポジトリの CLAUDE.md などを読ませない
    const child = spawn(command, args, { cwd: tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      if (code !== 0) {
        return reject(new Error(`${command} exited with code ${code}: ${stderr.trim().slice(-500)}`));
      }
      resolve(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function claudeArgs(model) {
  const args = [
    '-p',
    '--output-format', 'text',
    // 変換に道具は要らない。ファイル操作やコマンド実行をさせない
    '--tools', '',
    // ユーザー設定（hooks・plugins）や MCP サーバを読み込まず、毎回同じ条件で動かす
    '--setting-sources', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--system-prompt', SYSTEM_PROMPT,
  ];
  if (model) args.push('--model', model);
  return args;
}

export function createGenerator(cfg, deps = {}) {
  const spawn = deps.spawn || nodeSpawn;
  const fetchFn = deps.fetch || globalThis.fetch;
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (cfg.type === 'claude') {
    // ANTHROPIC_API_KEY があると CLI は API 課金で動くため外し、ログイン中のサブスクリプションを使わせる
    const { ANTHROPIC_API_KEY: _omit, ...env } = deps.env || process.env;
    return {
      name: cfg.model ? `claude (${cfg.model})` : 'claude',
      async generate({ markdown, title }) {
        const out = await runProcess(spawn, cfg.command, claudeArgs(cfg.model), {
          input: buildUserPrompt({ markdown, title }),
          env,
          timeoutMs,
        });
        return extractHtml(out);
      },
    };
  }

  if (cfg.type === 'command') {
    // システムプロンプトを渡す共通の口が無いので、stdin の先頭に付ける（ollama run などに使える）
    const env = deps.env || process.env;
    return {
      name: [cfg.command, ...cfg.args].join(' '),
      async generate({ markdown, title }) {
        const out = await runProcess(spawn, cfg.command, cfg.args, {
          input: `${SYSTEM_PROMPT}\n\n${buildUserPrompt({ markdown, title })}`,
          env,
          timeoutMs,
        });
        return extractHtml(out);
      },
    };
  }

  if (cfg.type === 'ollama') {
    return {
      name: `ollama (${cfg.model})`,
      async generate({ markdown, title }) {
        const res = await fetchFn(`${cfg.url.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: cfg.model,
            system: SYSTEM_PROMPT,
            prompt: buildUserPrompt({ markdown, title }),
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`ollama responded ${res.status}: ${data.error || ''}`);
        return extractHtml(data.response || '');
      },
    };
  }

  throw new Error(`unknown generator type: ${cfg.type}`);
}
