// config.json の "rich" セクションを正規化する。server.js から切り出してユニットテスト可能にしている。
import path from 'node:path';

// 長いページは claude でも数分かかるため、短すぎると正常な生成まで打ち切ってしまう
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

// 変換は情報を保ったまま組み替える中程度の作業で、Opus では枠の消費と待ち時間に見合わない
const DEFAULT_CLAUDE_MODEL = 'sonnet';

function resolveGenerator(g = {}) {
  const type = g.type || 'claude';
  if (type === 'claude') {
    return { type, command: g.command || 'claude', model: g.model || DEFAULT_CLAUDE_MODEL };
  }
  if (type === 'ollama') {
    if (!g.model) throw new Error('rich.generator.model is required for ollama');
    return { type, url: g.url || DEFAULT_OLLAMA_URL, model: g.model };
  }
  if (type === 'command') {
    if (!g.command) throw new Error('rich.generator.command is required for command');
    return { type, command: g.command, args: Array.isArray(g.args) ? g.args : [] };
  }
  throw new Error(`unknown rich.generator.type: ${type}`);
}

// 生成物は vault を汚さないよう、既定では md-live-viewer 側（rootDir/.cache/rich）に置く
export function resolveRichConfig(raw, rootDir) {
  const r = raw || {};
  return {
    cacheDir: path.resolve(rootDir, r.cacheDir || path.join('.cache', 'rich')),
    timeoutMs: typeof r.timeoutMs === 'number' && r.timeoutMs > 0 ? r.timeoutMs : DEFAULT_TIMEOUT_MS,
    generator: resolveGenerator(r.generator),
  };
}
