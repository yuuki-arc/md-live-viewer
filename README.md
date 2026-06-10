# md-live-viewer

任意ディレクトリの Markdown 群を、画面から切替可能な形でライブ配信する軽量ローカルビューア。

- **動的ソース切替**: footer の Source select からワンクリックで別ディレクトリを表示
- **ライブリロード**: ファイル保存 → ブラウザ自動更新（SSE）
- **Obsidian 記法対応**: `[[wikilinks]]`、`> [!note]` callout
- **lazy サイドバー**: 10k ページ規模を想定したディレクトリツリーの遅延展開。表示中ページの祖先ディレクトリは自動展開・ハイライト
- **テーマ切替**: 5 種のカラーテーマ（localStorage 保存）

Eleventy 静的ビルド方式の姉妹プロジェクト `wiki-viewer/` とは独立。

## セットアップ

```bash
git clone <this-repo-url> md-live-viewer
cd md-live-viewer
npm install
cp config.example.json config.json
# config.json を編集して、対象 Markdown ディレクトリの絶対パスを記入
npm run dev
```

`http://localhost:8082/` をブラウザで開く。

`config.json` はマシン固有の絶対パスを含むため `.gitignore` 対象。リポジトリには `config.example.json` をテンプレートとして同梱している。

## ソースの追加

`config.json` を編集して `vaults` 配列にエントリを追加後、サーバを再起動:

```json
{
  "current": "notes",
  "vaults": [
    { "slug": "notes",      "label": "Notes",      "path": "/絶対/パス/markdown/dir" },
    { "slug": "work-notes", "label": "Work notes", "path": "/絶対/パス/work" }
  ]
}
```

起動後、footer の Source select に追加分が現れる。切替時はインメモリ状態のみ更新され、再スキャン後に自動リロード。

## アーキテクチャ

```
Browser ──HTTP/SSE──> Hono (server.js, :8082)
                        │
                        ├─ state (in-memory: index, tree, LRU, SSE clients)
                        ├─ indexer ── chokidar ── vault filesystem
                        ├─ render  ── markdown-it + wikilinks + callouts + gray-matter
                        ├─ tree    ── lazy subtree API
                        ├─ search  ── MiniSearch (fuzzy + prefix)
                        └─ sse     ── reload bus
```

- **ページ取得**: `GET /:path/` → state.index から filePath 解決 → markdown-it で HTML 変換 → LRU キャッシュ
- **サイドバー**: 初期 shell のみ、`<details>` 展開時に `/api/tree?path=...` で子を取得
- **ファイル変更**: chokidar → index 更新 → LRU invalidate → SSE `reload`
- **vault 切替**: `POST /api/switch {slug}` → watcher stop → state reset → 新 vault walk → SSE `reload` ブロードキャスト

## ディレクトリ構成

```
md-live-viewer/
├── server.js               # Hono アプリ
├── lib/
│   ├── state.js            # 中央状態
│   ├── indexer.js          # walk + chokidar
│   ├── render.js           # markdown-it + wikilinks + callouts
│   ├── tree.js             # /api/tree?path= 用
│   ├── search.js           # /api/search?q= 用
│   ├── sse.js              # /api/live 用
│   └── template.js         # {{title}}/{{content}} 置換
├── _includes/
│   └── base.html           # HTML テンプレート
├── assets/
│   ├── css/                # _base.css + 5 テーマ
│   └── js/                 # sidebar.js / live.js / vault.js
├── config.json             # vault 一覧
└── package.json
```

## 除外ルール

`config.json` の `excludedDirs` / `excludedFiles` で指定する。デフォルトは `.git` のみ：

```json
{
  "current": "...",
  "vaults": [...],
  "excludedDirs": [".git"],
  "excludedFiles": []
}
```

- `excludedDirs`: ソース直下に該当名のディレクトリがあれば、その配下を一切インデックスしない（basename 一致）
- `excludedFiles`: ソース直下のファイル名（`<vault>/CLAUDE.md` 等）を除外。subdir 配下は対象外

未指定なら `excludedDirs: [".git"]`、`excludedFiles: []` が適用される。

## HTTP API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/` | currentVault のトップリスト |
| GET | `/:path/` | Markdown ページレンダリング |
| GET | `/assets/**` | CSS/JS 静的配信 |
| GET | `/_attachments/**` | currentVault の添付ファイル |
| GET | `/api/tree?path=` | サブツリー JSON |
| GET | `/api/search?q=` | ファイル名・パスの fuzzy / prefix 検索 (MiniSearch) |
| GET | `/api/vaults` | 設定済み vault 一覧 |
| POST | `/api/switch` | body `{slug}` で切替 |
| GET | `/api/live` | SSE、`reload` イベント受信 |

## テスト

Node 標準のテストランナー（追加依存なし）。`test/` 配下の `*.test.js` を実行する。

```bash
npm test
```

## ロードマップ（着手順）

利便性 ÷ 実装コストの費用対効果で並べた着手順。

1. ~~現在ページの祖先ディレクトリを初期展開~~ ✅ **実装済み** — 深い階層のページを開いても、サイドバーが現在地までを自動展開しハイライトする
2. **全文検索** — 現在の検索はファイル名・パスのみ（`lib/search.js`）。MiniSearch に本文フィールドを足して全文検索化する（本命）
3. **リンク索引 → dead wikilink ハイライト ＋ バックリンク** — 全ファイルの `[[wikilink]]` を抽出した逆引きマップを 1 つ用意し、リンク切れ検出とバックリンク表示を同じ基盤で実現する
4. 後回し / 凍結
   - UI から任意パスの vault 追加フォーム（設定は初回のみで発生頻度が低い）
   - @parcel/watcher に差替（10k+ 規模の起動高速化のみで体感差が小さい）
   - グラフビュー（全ノード展開が前提で「全件を広げない」lazy 設計と衝突するため凍結）

## テーマ

5 種のカラーテーマ（`assets/css/` 配下）:

- `petal-rose.css` (default)
- `cream-terracotta.css`
- `mint-sage.css`
- `mist-blue.css`
- `lilac-plum.css`

footer の Theme select で切替、localStorage キー `md-live-viewer-theme` に保存。

## ポート

デフォルト 8082。`PORT` 環境変数で上書き可能。

```bash
PORT=3000 npm run dev
```

## 依存

- [Hono](https://hono.dev/) — HTTP ルーティング
- [markdown-it](https://github.com/markdown-it/markdown-it) — Markdown パーサ
- [markdown-it-wikilinks](https://github.com/jsepia/markdown-it-wikilinks) — `[[links]]`
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — YAML frontmatter
- [chokidar](https://github.com/paulmillr/chokidar) — ファイル監視
- [lru-cache](https://github.com/isaacs/node-lru-cache) — 描画結果キャッシュ
- [MiniSearch](https://github.com/lucaong/minisearch) — fuzzy / prefix 検索

Obsidian callouts は自前実装（`lib/render.js` の `preprocessCallouts`）。
