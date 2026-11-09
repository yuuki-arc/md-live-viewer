// Markdown の隣に置かれた画像・PDF などを、ページと同じ URL 空間（/<dir>/<file>）で返すための解決。
// 返すのは拡張子が MIME 表にあるファイルだけで、Markdown や設定ファイルなどは対象外。
// vault の外（.. やシンボリックリンク経由）と除外ディレクトリ・除外ファイルには届かない。
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

export function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || null;
}

function isInside(root, p) {
  return p === root || p.startsWith(root + path.sep);
}

// reqPath はデコード済みの URL パス（例: '/docs/a.png'）。返せないなら null。
// 除外と拡張子の判定は、. / .. やシンボリックリンクを解決した vault 内の実体パスに対して行う
// （リクエストの見た目で判定すると、/./skip.png や除外先を指すリンクですり抜けられる）
export function resolveAsset(vaultPath, reqPath, { excludedDirs = new Set(), excludedFiles = new Set() } = {}) {
  // ページへのリクエストのたびに fs を触らないよう、見た目で明らかに対象外なものは先に落とす
  if (!reqPath || reqPath.endsWith('/') || !mimeOf(reqPath)) return null;
  const reqSegs = reqPath.split('/').filter(Boolean);
  if (reqSegs.length === 0) return null;
  try {
    const root = realpathSync(vaultPath);
    const real = realpathSync(path.resolve(root, ...reqSegs));
    if (!isInside(root, real) || real === root || !mimeOf(real)) return null;
    const segs = path.relative(root, real).split(path.sep);
    if (segs.some((s) => excludedDirs.has(s))) return null;
    if (segs.length === 1 && excludedFiles.has(segs[0])) return null;
    if (!statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}
