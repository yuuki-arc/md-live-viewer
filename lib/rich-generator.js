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

// SIGTERM を無視されたときに SIGKILL へ切り替えるまでの猶予
const DEFAULT_KILL_GRACE_MS = 5000;
// 暴走した生成器にメモリを食われないための上限。HTML 1 枚としては十分に大きい
const DEFAULT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

function runProcess(spawn, command, args, { input, env, timeoutMs, killGraceMs, maxOutputBytes }) {
  return new Promise((resolve, reject) => {
    // cwd を一時ディレクトリにして、vault やこのリポジトリの CLAUDE.md などを読ませない
    const child = spawn(command, args, { cwd: tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
    // Buffer のまま溜めて最後にまとめてデコードする。チャンクごとに文字列にすると、
    // 日本語などの多バイト文字がチャンクの境界で分かれたときに文字化けする
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    // child.killed は「シグナルを送れた」ことしか表さないので、終了は close で自前に記録する
    let exited = false;
    let killTimer = null;
    // close を待たずに決着させる。プロセスが終わらなくても直列キューを詰まらせない
    const settle = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL');
      }, killGraceMs);
      killTimer.unref?.();
      settle(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const onData = (append) => (b) => {
      if (settled) return;
      outputBytes += b.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        return settle(new Error(`${command} output too large (> ${maxOutputBytes} bytes)`));
      }
      append(b);
    };
    child.stdout.on('data', onData((b) => stdout.push(b)));
    child.stderr.on('data', onData((b) => stderr.push(b)));
    child.on('error', (err) => settle(err));
    child.on('close', (code) => {
      exited = true;
      clearTimeout(killTimer);
      if (code !== 0) {
        return settle(new Error(`${command} exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').trim().slice(-500)}`));
      }
      settle(null, Buffer.concat(stdout).toString('utf8'));
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
  const killGraceMs = deps.killGraceMs || DEFAULT_KILL_GRACE_MS;
  const maxOutputBytes = deps.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;

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
          killGraceMs,
          maxOutputBytes,
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
          killGraceMs,
          maxOutputBytes,
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
