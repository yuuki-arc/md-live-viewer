// 非同期処理を 1 つずつ順番に実行するキュー。vault 切替のように、途中の状態
// （watcher 停止〜再インデックス）が重なると壊れる処理を直列化するのに使う。
// 失敗はその呼び出し元にだけ返し、後続の実行は止めない
export function createSerialQueue() {
  let tail = Promise.resolve();
  return function run(task) {
    const result = tail.then(() => task());
    tail = result.catch(() => {});
    return result;
  };
}
