// 生成したリッチ HTML のキャッシュ。1 ページにつき <hash>.json に本体とメタ情報をまとめて置く。
// 別ファイルにすると、再生成の途中で新しい本体と古いメタ情報の組み合わせを読まれることがある
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function hashSource(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function createRichStore(cacheDir) {
  // ファイル名を slug と URL のハッシュにすることで、../ や日本語を含むパスでも
  // キャッシュディレクトリの外に書き出さない。区切りの \0 は slug・URL に現れない
  function file(slug, url) {
    return path.join(cacheDir, hashSource(`${slug}\0${url}`) + '.json');
  }

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
        const { html, meta } = JSON.parse(readFileSync(file(slug, url), 'utf8'));
        // 本体を持たない旧形式（メタ情報だけの .json）は未生成として扱い、再生成を促す
        return typeof html === 'string' && meta ? { html, meta } : null;
      } catch {
        return null;
      }
    },
    write(slug, url, { html, meta }) {
      mkdirSync(cacheDir, { recursive: true });
      writeAtomic(file(slug, url), JSON.stringify({ meta, html }));
    },
  };
}
