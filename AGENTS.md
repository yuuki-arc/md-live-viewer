# md-live-viewer — エージェント向けプロジェクト指示

任意ディレクトリの Markdown 群をライブ配信するローカルビューア（Hono + SSE、Node.js ESM）。
アーキテクチャ・HTTP API・ディレクトリ構成・テーマの詳細は README.md を参照（ここには重複させない）。

## コマンド

- `npm run dev` — 開発サーバ起動（`node --watch`、ポート 7777、`PORT` 環境変数で上書き可）
- `npm test` — ユニットテスト（Node 標準テストランナー、`test/*.test.js`、追加依存なし）
- `npm run test:e2e` — Playwright E2E（ポート 7778 を占有。初回のみ `npx playwright install chromium`）

## 前提・制約

- ESM（`package.json` の `"type": "module"`）。CommonJS 構文（`require` / `module.exports`）は使わない
- サーバ起動には `config.json` が必要（`config.example.json` からコピーして作成）。マシン固有の絶対パスを含むため git 管理外 — コミットに含めない
- ユニットテストは `config.json` 不要。E2E は `e2e/fixtures/vault/` を指す一時 config（`e2e/fixtures/.config.generated.json`）を自動生成する
- 姉妹プロジェクト `wiki-viewer/`（Eleventy 静的ビルド方式）とは独立。コードも設定も共有しない

## 開発規約

- テストファースト（TDD）。挙動を変える前に `test/` または `e2e/` にテストを追加する
- コミットは Conventional Commits、subject は日本語（例: `fix(ui): 初期ツリー取得をリトライしサイドバー空表示を防ぐ`）。why を書く
- 依存は軽量・最小限を維持する（Obsidian callouts も `lib/render.js` で自前実装している）。追加前に既存依存で実現できないか確認する
- サイドバーは「全件を広げない」lazy 設計が前提。全ノード展開を要求する機能（グラフビュー等）は導入しない
