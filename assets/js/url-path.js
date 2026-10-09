// ページ URL（state.index のキー = 未エンコードの実ファイルパス）と、
// HTTP 上のエンコード済みパスを相互変換する純粋関数。ブラウザとサーバの両方で使う。
//
// encodeURI / decodeURI は & # ? % などの予約文字を素通しするため、ファイル名に
// それらを含むページで href が壊れたり index と突き合わなくなる。必ずセグメント単位で
// encodeURIComponent / decodeURIComponent する。

export function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// 不正なエスケープ（"%E3%83" や "50%" など）を含む場合は null
export function decodePath(pathname) {
  try {
    return String(pathname).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}
