# md-live-viewer

任意ディレクトリの Markdown 群を、画面から切替可能な形でライブ配信する軽量ローカルビューア。

- **動的ソース切替**: footer の Source select からワンクリックで別ディレクトリを表示
- **ライブリロード**: ファイル保存 → ブラウザ自動更新（SSE）
- **Obsidian 記法対応**: `[[wikilinks]]`、`> [!note]` callout
- **Mermaid 図**: ` ```mermaid ` フェンスをブラウザ側で SVG 描画（CDN 読み込みのため要ネットワーク。オフライン時・構文エラー時はコード表示のまま）
- **lazy サイドバー**: 10k ページ規模を想定したディレクトリツリーの遅延展開。表示中ページの祖先ディレクトリは自動展開・ハイライト
- **テーマ切替**: 5 種のカラーテーマ（localStorage 保存）
- **生 Markdown モード**: `/_raw/<ページパス>/` でファイルの中身をそのまま `text/plain` 配信（JS・CSS を一切読み込まない）
- **Rich 表示**: ページ上部の切替で Markdown / Rich を選べる。Rich はローカルの `claude` CLI などで生成したリッチ HTML を表示する（API キー不要。詳細は「[Rich 表示](#rich-表示)」）

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

`http://127.0.0.1:7777/` をブラウザで開く（IPv4 のループバックで待ち受けるため、`localhost` を IPv6 の `::1` で解決するツールでは接続できない）。

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

## Rich 表示

各ページ上部の **Markdown / Rich** 切替で表示モードを選ぶ（選択は localStorage に保存）。Rich では、Markdown を LLM でリッチな HTML に変換したものを表示する。

- **生成は手動**: Rich 表示で「生成する」を押したページだけ生成する。Markdown を編集すると「元の Markdown が更新されています」と出るので、必要なら「再生成」する（保存のたびに自動生成はしない）
- **API キー・従量課金なし**: 既定ではローカルの `claude` CLI（`claude -p`）を子プロセスで呼び、ログイン中の Claude サブスクリプションの利用枠で生成する。`ANTHROPIC_API_KEY` は子プロセスに渡さない。ツールなし・ユーザー設定 / MCP なしで実行するため、ファイル操作やコマンド実行はさせない
- **キャッシュ**: 生成物は md-live-viewer 側の `.cache/rich/`（git 管理外）に置き、vault には書き込まない。`.cache/rich/<vault の slug>/<ページのパス>/index.html` に置くので、ファイルをブラウザで直接開ける（メタ情報は末尾の `<script type="application/json" id="mlv-meta">` に埋め込む）
- **配色**: 生成物には色を `--mlv-bg` / `--mlv-accent` などの CSS 変数だけで書かせる。Rich 表示ではビューアのテーマの色で上書きし、テーマを切り替えると追従する。ファイルを直接開いたときは、生成物が自分で決めた配色（OS のダークモードにも追従）で表示される。この仕組みより前に生成したページは、再生成するとテーマに追従する
- **隔離**: 生成 HTML は `sandbox`（`allow-same-origin` なし）の iframe と CSP で表示し、ビューアの API・外部リソースの読み込み・通信・フォーム送信を禁じる。外部リソースを読まない自己完結 HTML を生成させる。ただし元の Markdown の外部リンクを開けるよう、クリックで新しいタブを開くことは許している（生成物は LLM の出力なので、怪しいリンクは開かない）
- 生成は 1 件ずつ順番に実行する。1 ページあたり数十秒〜数分かかる

生成器は `config.json` の `rich` で切り替える（省略時は `claude`）:

```json
{
  "rich": {
    "generator": { "type": "claude", "model": "sonnet" },
    "cacheDir": ".cache/rich",
    "timeoutMs": 600000
  }
}
```

| `generator.type` | 設定項目 | 動作 |
|---|---|---|
| `claude`（既定） | `command`（既定 `claude`）、`model`（既定 `sonnet`） | `claude -p` を呼ぶ |
| `ollama` | `model`（必須）、`url`（既定 `http://127.0.0.1:11434`） | Ollama の `/api/generate` を呼ぶ |
| `command` | `command`（必須）、`args` | 任意のコマンドを起動し、stdin にプロンプト、stdout から HTML を受け取る（例: `ollama run <model>`） |

設定が不正な場合も Markdown 表示はそのまま使え、Rich 表示に理由を表示する。

## アーキテクチャ

```
Browser ──HTTP/SSE──> Hono (server.js, :7777)
                        │
                        ├─ state (in-memory: index, tree, LRU, SSE clients)
                        ├─ indexer ── chokidar ── vault filesystem
                        ├─ render  ── markdown-it + wikilinks + callouts + mermaid fence + gray-matter
                        ├─ tree    ── lazy subtree API
                        ├─ search  ── MiniSearch (fuzzy + prefix)
                        ├─ rich    ── claude CLI / Ollama / command → .cache/rich
                        └─ sse     ── reload bus
```

- **ページ取得**: `GET /:path/` → state.index から filePath 解決 → markdown-it で HTML 変換 → LRU キャッシュ
- **生 Markdown**: `GET /_raw/:path/` → 同じく state.index から filePath 解決 → 無加工のまま `text/plain` で返す。HTML テンプレートを通さないため、この URL ではクライアント JS が一切走らない（レンダリング済みページの footer の Raw リンクから辿れる）
- **サイドバー**: 初期 shell のみ、`<details>` 展開時に `/api/tree?path=...` で子を取得
- **ファイル変更**: chokidar → index 更新 → LRU invalidate → SSE `reload`
- **Rich 表示**: `POST /api/rich/generate` → 生成ジョブ（1 件ずつ）→ キャッシュに保存 → SSE `rich` → `GET /_rich/:path/` を sandbox iframe で表示
- **vault 切替**: `POST /api/switch {slug}` → watcher stop → state reset → 新 vault walk → SSE `reload` ブロードキャスト

## ディレクトリ構成

```
md-live-viewer/
├── server.js               # Hono アプリ
├── lib/
│   ├── state.js            # 中央状態
│   ├── indexer.js          # walk + chokidar
│   ├── render.js           # markdown-it + wikilinks + callouts + mermaid フェンス
│   ├── tree.js             # /api/tree?path= 用
│   ├── search.js           # /api/search?q= 用
│   ├── sse.js              # /api/live 用
│   ├── raw.js              # /_raw/ の URL 変換
│   ├── template.js         # {{title}} / {{source}} / {{rawLink}} / {{content}} 置換
│   ├── escape.js           # HTML エスケープ
│   ├── host.js             # 待受アドレスの決定、Host / Origin の検証
│   ├── rich-config.js      # config.json の rich セクションの正規化
│   ├── rich-generator.js   # Markdown → リッチ HTML の生成器（claude / ollama / command）
│   ├── rich-cache.js       # 生成物のキャッシュ（.cache/rich）
│   ├── rich-jobs.js        # 生成ジョブの状態管理と直列実行
│   ├── rich-page.js        # /_rich/ の URL 変換・CSP・高さ通知スクリプト
│   ├── rich-theme.js       # テーマ CSS の色を生成物の --mlv-* 変数に読み替える
│   └── serial.js           # 非同期処理の直列化（vault 切替用）
├── _includes/
│   └── base.html           # HTML テンプレート
├── assets/
│   ├── css/                # _base.css + 5 テーマ
│   └── js/
│       ├── sidebar.js      # lazy サイドバー・検索
│       ├── tree-path.js    # 現在ページの祖先ディレクトリの導出
│       ├── url-path.js     # ページ URL とエンコード済みパスの相互変換（サーバと共有）
│       ├── live.js         # SSE によるライブリロード
│       ├── toc.js          # 目次
│       ├── slug.js         # 見出し ID の生成（toc.js と wikilink で共有）
│       ├── menu-toggle.js  # モバイルのサイドバー開閉
│       ├── vault.js        # Source 切替
│       ├── rich-view.js    # Markdown / Rich の表示切替と生成操作
│       └── mermaid-init.js # Mermaid 図の描画
├── test/                   # ユニットテスト（node --test）
├── e2e/                    # Playwright E2E（fixtures/vault/ がテスト用 vault）
├── config.example.json     # config.json のテンプレート
├── config.json             # vault 一覧（.gitignore 対象）
├── playwright.config.js
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
| GET | `/_raw/:path/` | 生 Markdown を `text/plain` で返す（レンダリング・JS なし） |
| GET | `/_rich/:path/?theme=` | 生成済みのリッチ HTML（sandbox CSP 付き）。`theme` を付けるとそのテーマの色で表示する。未生成なら 404 |
| GET | `/api/rich?path=` | Rich 表示の状態（生成済みか・古いか・ジョブの状態） |
| POST | `/api/rich/generate` | body `{path}` で生成を依頼（202） |
| GET | `/api/tree?path=` | サブツリー JSON |
| GET | `/api/search?q=` | ファイル名・パスの fuzzy / prefix 検索 (MiniSearch) |
| GET | `/api/vaults` | 設定済み vault 一覧 |
| POST | `/api/switch` | body `{slug}` で切替 |
| GET | `/api/live` | SSE、`reload` / `rich` イベント受信 |

## テスト

ユニットテストは Node 標準のテストランナー（追加依存なし）。`test/` 配下の `*.test.js` を実行する。

```bash
npm test
```

E2E は Playwright（`@playwright/test`、dev 依存）。`e2e/fixtures/vault/` を指す一時 config を生成してサーバを起動し、ヘッドレス Chromium でサイドバーの祖先自動展開などを検証する。Rich 表示の生成器は `e2e/fixtures/fake-generator.js` に差し替えるため、E2E で claude CLI は呼ばない。

```bash
npx playwright install chromium   # 初回のみ
npm run test:e2e
```

E2E 実行中はポート 7778 を占有する（`playwright.config.js`）。

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

## ポート・待受アドレス

デフォルト 7777。`PORT` 環境変数で上書き可能。

既定では `127.0.0.1`（このマシン）からのみアクセスできる。vault の内容や絶対パスを返すため、
LAN 内の別端末（スマホ等）から見たい場合だけ `MLV_HOST` で待受アドレスを明示する
（汎用の `HOST` はシェルがホスト名を入れていることがあるため読まない）。

```bash
PORT=3000 npm run dev
MLV_HOST=0.0.0.0 npm run dev   # LAN に公開する（信頼できるネットワークでのみ）
```

ループバック待受時は `Host` ヘッダが `localhost` / `127.0.0.1` / `[::1]` 以外のリクエストを 403 にする
（DNS リバインディング対策）。また `Origin` ヘッダ付きのリクエストは同一オリジンのみ受け付ける
（他サイトからの vault 切替などの CSRF 対策）。

## 依存

- [Hono](https://hono.dev/) — HTTP ルーティング
- [markdown-it](https://github.com/markdown-it/markdown-it) — Markdown パーサ
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — YAML frontmatter
- [chokidar](https://github.com/paulmillr/chokidar) — ファイル監視
- [lru-cache](https://github.com/isaacs/node-lru-cache) — 描画結果キャッシュ
- [MiniSearch](https://github.com/lucaong/minisearch) — fuzzy / prefix 検索

Obsidian callouts は自前実装（`lib/render.js` の `obsidianCallouts`。markdown-it の core ruler によるトークン変換）。
`[[wikilinks]]` も自前実装（`lib/render.js` の `obsidianWikilinks`）。href はサイドバーと同じ正規形（セグメント単位でエンコード・末尾 `/`）。

Mermaid は npm 依存ではなく、ブラウザが実行時に [jsDelivr CDN](https://www.jsdelivr.com/) から ESM を読み込む（`assets/js/mermaid-init.js`、バージョン完全固定）。図の描画のみネットワークが必要で、到達不可・構文エラー時はコードブロック表示にフォールバックする。
