import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createGenerator, extractHtml, buildUserPrompt, SYSTEM_PROMPT } from '../lib/rich-generator.js';

const DOC = '<!doctype html><html><body><p>ok</p></body></html>';

// child_process.spawn の代わり。stdin に書かれた内容と起動引数を記録し、
// 指定した stdout と終了コードで終わる
function fakeSpawn({ stdout = DOC, stderr = '', code = 0, hang = false, stubborn = false, chunks = null } = {}) {
  const calls = [];
  const signals = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    // Node と同じく killed は「シグナルを送れた」ことを表し、終了したかどうかではない。
    // stubborn: シグナルを無視して終わらないプロセス
    child.kill = (sig) => {
      signals.push(sig);
      child.killed = true;
      if (stubborn) return;
      setImmediate(() => child.emit('close', null));
    };
    const call = { command, args, options, stdin: '' };
    calls.push(call);
    child.stdin.on('data', (b) => { call.stdin += b; });
    child.stdin.on('finish', () => {
      if (hang) return;
      setImmediate(() => {
        if (chunks) {
          for (const c of chunks) child.stdout.write(c);
          child.stdout.end();
        } else {
          child.stdout.end(stdout);
        }
        child.stderr.end(stderr);
        child.emit('close', code);
      });
    });
    return child;
  };
  return { spawn, calls, signals };
}

test('extractHtml はコードフェンスや前置きを取り除いて HTML 文書だけを返す', () => {
  assert.equal(extractHtml(DOC), DOC);
  assert.equal(extractHtml('Here you go:\n```html\n' + DOC + '\n```\n'), DOC);
  assert.equal(extractHtml('<!DOCTYPE html>\n<html lang="ja"><body></body></html>\ntrailing'), '<!DOCTYPE html>\n<html lang="ja"><body></body></html>');
  assert.equal(extractHtml('<html><body>x</body></html>'), '<html><body>x</body></html>');
});

test('extractHtml は HTML 文書を含まない出力をエラーにする', () => {
  assert.throws(() => extractHtml('申し訳ありませんが変換できません'), /HTML/);
});

test('buildUserPrompt はタイトルと Markdown 本文を含める', () => {
  const p = buildUserPrompt({ markdown: '# 見出し\n本文', title: 'ページ' });
  assert.match(p, /ページ/);
  assert.match(p, /# 見出し\n本文/);
});

test('claude: ツールなし・設定や MCP を読まない headless 実行で、stdin に Markdown を渡す', async () => {
  const { spawn, calls } = fakeSpawn();
  const gen = createGenerator({ type: 'claude', command: 'claude', model: null }, { spawn, env: { PATH: '/bin' } });
  const html = await gen.generate({ markdown: '# A', title: 'A' });

  assert.equal(html, DOC);
  assert.equal(gen.name, 'claude');
  const [call] = calls;
  assert.equal(call.command, 'claude');
  const args = call.args;
  assert.ok(args.includes('-p'));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--no-session-persistence'));
  assert.equal(args[args.indexOf('--system-prompt') + 1], SYSTEM_PROMPT);
  assert.ok(!args.includes('--model'));
  assert.match(call.stdin, /# A/);
});

test('claude: API キーの環境変数を子プロセスに渡さない（従量課金ではなくログイン中のサブスクリプションを使う）', async () => {
  const { spawn, calls } = fakeSpawn();
  const gen = createGenerator(
    { type: 'claude', command: 'claude', model: null },
    { spawn, env: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-xxx', HOME: '/home/u' } }
  );
  await gen.generate({ markdown: '# A', title: 'A' });
  const env = calls[0].options.env;
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/home/u');
});

test('claude: model を指定すると --model を付け、名前にも出す', async () => {
  const { spawn, calls } = fakeSpawn();
  const gen = createGenerator({ type: 'claude', command: 'claude', model: 'sonnet' }, { spawn, env: {} });
  await gen.generate({ markdown: '# A', title: 'A' });
  assert.equal(calls[0].args[calls[0].args.indexOf('--model') + 1], 'sonnet');
  assert.equal(gen.name, 'claude (sonnet)');
});

test('終了コードが 0 以外なら stderr を含めてエラーにする', async () => {
  const { spawn } = fakeSpawn({ stdout: '', stderr: 'Not logged in', code: 1 });
  const gen = createGenerator({ type: 'claude', command: 'claude', model: null }, { spawn, env: {} });
  await assert.rejects(gen.generate({ markdown: '# A', title: 'A' }), /Not logged in/);
});

test('タイムアウトしたらプロセスを止めてエラーにする', async () => {
  const { spawn } = fakeSpawn({ hang: true });
  const gen = createGenerator({ type: 'claude', command: 'claude', model: null }, { spawn, env: {}, timeoutMs: 20 });
  await assert.rejects(gen.generate({ markdown: '# A', title: 'A' }), /timed out/);
});

test('SIGTERM を無視するプロセスでもタイムアウトで即エラーにし、猶予後に SIGKILL する', async () => {
  const { spawn, signals } = fakeSpawn({ hang: true, stubborn: true });
  const gen = createGenerator({ type: 'claude', command: 'claude', model: null }, { spawn, env: {}, timeoutMs: 20, killGraceMs: 10 });
  await assert.rejects(gen.generate({ markdown: '# A', title: 'A' }), /timed out/);
  assert.deepEqual(signals, ['SIGTERM']);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('多バイト文字がチャンクの境界で分かれても文字化けしない', async () => {
  const buf = Buffer.from('<!doctype html><html><body>日本語</body></html>');
  const cut = buf.indexOf(Buffer.from('本')) + 1;
  const { spawn } = fakeSpawn({ chunks: [buf.subarray(0, cut), buf.subarray(cut)] });
  const gen = createGenerator({ type: 'claude', command: 'claude', model: null }, { spawn, env: {} });
  assert.equal(await gen.generate({ markdown: '# A', title: 'A' }), buf.toString('utf8'));
});

test('出力が上限を超えたらプロセスを止めてエラーにする', async () => {
  const { spawn, signals } = fakeSpawn({ stdout: 'x'.repeat(100) });
  const gen = createGenerator({ type: 'command', command: 'gen', args: [] }, { spawn, env: {}, maxOutputBytes: 10 });
  await assert.rejects(gen.generate({ markdown: '# A', title: 'A' }), /too large/);
  assert.deepEqual(signals, ['SIGKILL']);
});

test('command: 指定コマンドを引数付きで起動し、システムプロンプトごと stdin に渡す', async () => {
  const { spawn, calls } = fakeSpawn({ stdout: '```html\n' + DOC + '\n```' });
  const gen = createGenerator({ type: 'command', command: 'ollama', args: ['run', 'qwen'] }, { spawn, env: {} });
  const html = await gen.generate({ markdown: '# A', title: 'A' });
  assert.equal(html, DOC);
  assert.equal(calls[0].command, 'ollama');
  assert.deepEqual(calls[0].args, ['run', 'qwen']);
  assert.ok(calls[0].stdin.startsWith(SYSTEM_PROMPT));
  assert.match(calls[0].stdin, /# A/);
  assert.equal(gen.name, 'ollama run qwen');
});

test('ollama: /api/generate に system と prompt を非ストリーミングで送る', async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ response: 'sure\n' + DOC }) };
  };
  const gen = createGenerator({ type: 'ollama', url: 'http://127.0.0.1:11434', model: 'qwen' }, { fetch });
  const html = await gen.generate({ markdown: '# A', title: 'A' });

  assert.equal(html, DOC);
  assert.equal(gen.name, 'ollama (qwen)');
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(requests[0].body.model, 'qwen');
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.system, SYSTEM_PROMPT);
  assert.match(requests[0].body.prompt, /# A/);
});

test('ollama: HTTP エラーはステータス付きのエラーにする', async () => {
  const fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'model not found' }) });
  const gen = createGenerator({ type: 'ollama', url: 'http://127.0.0.1:11434', model: 'x' }, { fetch });
  await assert.rejects(gen.generate({ markdown: '# A', title: 'A' }), /404.*model not found/);
});
