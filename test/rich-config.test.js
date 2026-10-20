import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveRichConfig, DEFAULT_TIMEOUT_MS } from '../lib/rich-config.js';

const ROOT = '/srv/mlv';

test('未指定なら claude CLI・ROOT/.cache/rich・既定タイムアウトになる', () => {
  const cfg = resolveRichConfig(undefined, ROOT);
  assert.deepEqual(cfg, {
    cacheDir: path.join(ROOT, '.cache', 'rich'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    generator: { type: 'claude', command: 'claude', model: null },
  });
});

test('cacheDir の相対パスは ROOT 基準で解決し、絶対パスはそのまま使う', () => {
  assert.equal(resolveRichConfig({ cacheDir: 'tmp/rich' }, ROOT).cacheDir, path.join(ROOT, 'tmp', 'rich'));
  assert.equal(resolveRichConfig({ cacheDir: '/var/cache/rich' }, ROOT).cacheDir, '/var/cache/rich');
});

test('claude はコマンド名とモデルを上書きできる', () => {
  const cfg = resolveRichConfig({ generator: { type: 'claude', command: '/opt/bin/claude', model: 'sonnet' } }, ROOT);
  assert.deepEqual(cfg.generator, { type: 'claude', command: '/opt/bin/claude', model: 'sonnet' });
});

test('ollama は URL の既定値を補い、model を必須にする', () => {
  const cfg = resolveRichConfig({ generator: { type: 'ollama', model: 'qwen2.5-coder' } }, ROOT);
  assert.deepEqual(cfg.generator, { type: 'ollama', url: 'http://127.0.0.1:11434', model: 'qwen2.5-coder' });
  assert.throws(() => resolveRichConfig({ generator: { type: 'ollama' } }, ROOT), /model/);
});

test('command は任意のコマンドと引数を受け付け、command を必須にする', () => {
  const cfg = resolveRichConfig({ generator: { type: 'command', command: 'node', args: ['gen.js'] } }, ROOT);
  assert.deepEqual(cfg.generator, { type: 'command', command: 'node', args: ['gen.js'] });
  assert.deepEqual(resolveRichConfig({ generator: { type: 'command', command: 'gen' } }, ROOT).generator.args, []);
  assert.throws(() => resolveRichConfig({ generator: { type: 'command' } }, ROOT), /command/);
});

test('未知の generator.type はエラーにする', () => {
  assert.throws(() => resolveRichConfig({ generator: { type: 'openai' } }, ROOT), /openai/);
});

test('timeoutMs は正の数だけ受け付ける', () => {
  assert.equal(resolveRichConfig({ timeoutMs: 1000 }, ROOT).timeoutMs, 1000);
  assert.equal(resolveRichConfig({ timeoutMs: -1 }, ROOT).timeoutMs, DEFAULT_TIMEOUT_MS);
  assert.equal(resolveRichConfig({ timeoutMs: '1000' }, ROOT).timeoutMs, DEFAULT_TIMEOUT_MS);
});
