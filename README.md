# md-live-viewer

任意ディレクトリの Markdown 群を、画面から切替可能な形でライブ配信する軽量ローカルビューア。

- **動的ソース切替**: footer の Source select からワンクリックで別ディレクトリを表示
- **ライブリロード**: ファイル保存 → ブラウザ自動更新（SSE）
- **Obsidian 記法対応**: `[[wikilinks]]`、`> [!note]` callout
- **lazy サイドバー**: 10k ページ規模を想定したディレクトリツリーの遅延展開
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
                        ├─ search  ── O(N) scan of state.index
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

以下のディレクトリはインデックス対象外（`lib/indexer.js` の `EXCLUDED_DIRS` で制御）:

- `.raw`, `_templates`, `.obsidian`, `Excalidraw`, `.git`, `.claude`, `node_modules`

特定のファイルを除外したい場合は `lib/indexer.js` の `EXCLUDED_ROOT_FILES`（root 直下、basename 一致）にエントリを追記する。

## HTTP API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/` | currentVault のトップリスト |
| GET | `/:path/` | Markdown ページレンダリング |
| GET | `/assets/**` | CSS/JS 静的配信 |
| GET | `/_attachments/**` | currentVault の添付ファイル |
| GET | `/api/tree?path=` | サブツリー JSON |
| GET | `/api/search?q=` | URL・ファイル名の部分一致検索 |
| GET | `/api/vaults` | 設定済み vault 一覧 |
| POST | `/api/switch` | body `{slug}` で切替 |
| GET | `/api/live` | SSE、`reload` イベント受信 |

## 将来の拡張

- UI から任意パスの vault 追加フォーム
- MiniSearch / Fuse.js による fuzzy 検索
- @parcel/watcher に差替（10k+ 規模で起動高速化）
- 現在ページの祖先ディレクトリを初期展開
- dead wikilink のハイライト
- バックリンク、グラフビュー

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

Obsidian callouts は自前実装（`lib/render.js` の `preprocessCallouts`）。
