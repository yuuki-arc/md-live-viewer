// 生成したリッチ HTML のキャッシュ。直接ブラウザで開けるよう、1 ページにつき
// <cacheDir>/<slug>/<ページのパス>/index.html を置き、メタ情報は末尾の JSON に埋め込む。
// 本体とメタ情報を別ファイルにすると、再生成の途中で新しい本体と古いメタ情報の組み合わせを読まれることがある
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function hashSource(text) {
  return createHash('sha256').update(text).digest('hex');
}

const FILE_NAME = 'index.html';
const META_OPEN = '<script type="application/json" id="mlv-meta">';
const META_CLOSE = '</script>';

// パスのセグメント（と slug）をファイル名として安全な形にする。% を必ずエスケープするので、
// エスケープした結果が別のページの素の名前と同じになることはない
function safeSegment(seg) {
  if (seg === '') return '%';
  let s = seg.replace(/[%/\\\0]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  // . / .. はディレクトリを抜け出せる。index.html は親ページのファイルとぶつかる
  if (s === '.' || s === '..' || s === FILE_NAME) s = s.replace(/\./g, '%2E');
  return s;
}

export function richFilePath(cacheDir, slug, url) {
  const segments = String(url).split('/').slice(1, -1);
  const root = path.resolve(cacheDir);
  const file = path.join(root, safeSegment(String(slug)), ...segments.map(safeSegment), FILE_NAME);
  // safeSegment で防いでいるが、万一外に出るパスになったら書かない
  if (!file.startsWith(root + path.sep)) throw new Error(`rich cache path escapes cache dir: ${url}`);
  return file;
}

// JSON 中の < をエスケープし、URL などに </script> を含んでも埋め込みが閉じないようにする
function encodeMeta(meta) {
  return META_OPEN + JSON.stringify(meta).replace(/</g, '\\u003c') + META_CLOSE;
}

function decodeMeta(text) {
  const start = text.lastIndexOf(META_OPEN);
  if (start === -1) return null;
  const end = text.indexOf(META_CLOSE, start);
  if (end === -1) return null;
  return { html: text.slice(0, start).replace(/\n$/, ''), meta: JSON.parse(text.slice(start + META_OPEN.length, end)) };
}

export function createRichStore(cacheDir) {
  // 書きかけのファイルを読まれないよう、一時ファイルに書いてから rename する
  function writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      writeFileSync(tmp, data);
      renameSync(tmp, file);
    } catch (err) {
      rmSync(tmp, { force: true });
      throw err;
    }
  }

  return {
    read(slug, url) {
      try {
        const got = decodeMeta(readFileSync(richFilePath(cacheDir, slug, url), 'utf8'));
        // メタ情報の無い HTML（手で置いたファイルなど）は未生成として扱い、再生成を促す
        return got && got.meta ? got : null;
      } catch {
        return null;
      }
    },
    write(slug, url, { html, meta }) {
      const file = richFilePath(cacheDir, slug, url);
      mkdirSync(path.dirname(file), { recursive: true });
      writeAtomic(file, `${html}\n${encodeMeta(meta)}\n`);
    },
  };
}
