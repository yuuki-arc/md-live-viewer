// 生成したリッチ HTML のキャッシュ。1 ページにつき <hash>.html（本体）と <hash>.json（メタ情報）を置く。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function hashSource(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function createRichStore(cacheDir) {
  // ファイル名を slug と URL のハッシュにすることで、../ や日本語を含むパスでも
  // キャッシュディレクトリの外に書き出さない。区切りの \0 は slug・URL に現れない
  function paths(slug, url) {
    const base = path.join(cacheDir, hashSource(`${slug}\0${url}`));
    return { html: base + '.html', meta: base + '.json' };
  }

  // 書きかけのファイルを読まれないよう、一時ファイルに書いてから rename する
  function writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  }

  return {
    read(slug, url) {
      const p = paths(slug, url);
      try {
        return {
          html: readFileSync(p.html, 'utf8'),
          meta: JSON.parse(readFileSync(p.meta, 'utf8')),
        };
      } catch {
        return null;
      }
    },
    // meta を後に書く。read は両方揃って初めて成功するので、途中で落ちても壊れた組み合わせを返さない
    write(slug, url, { html, meta }) {
      mkdirSync(cacheDir, { recursive: true });
      const p = paths(slug, url);
      writeAtomic(p.html, html);
      writeAtomic(p.meta, JSON.stringify(meta, null, 2));
    },
  };
}
