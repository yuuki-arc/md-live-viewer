import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = join(__dirname, 'e2e', 'fixtures', 'vault');
const GENERATED_CONFIG = join(__dirname, 'e2e', 'fixtures', '.config.generated.json');
const RICH_CACHE = join(__dirname, 'e2e', 'fixtures', '.rich-cache');
const PORT = 7778;

// 前回の生成物が残っていると「未生成」の状態から検証できないため毎回消す
rmSync(RICH_CACHE, { recursive: true, force: true });

// vault の絶対パスはマシン依存なので、フィクスチャ vault を指す config を
// テスト実行のたびに生成し、MLV_CONFIG でサーバに注入する。
writeFileSync(
  GENERATED_CONFIG,
  JSON.stringify(
    {
      current: 'fixture',
      vaults: [{ slug: 'fixture', label: 'Fixture', path: VAULT }],
      excludedDirs: ['.git'],
      excludedFiles: [],
      // claude CLI を呼ばないよう、固定の HTML を返す偽の生成器に差し替える
      rich: {
        cacheDir: RICH_CACHE,
        generator: {
          type: 'command',
          command: process.execPath,
          args: [join(__dirname, 'e2e', 'fixtures', 'fake-generator.js')],
        },
      },
    },
    null,
    2,
  ),
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /live-reload\.spec\.js/ },
    // vault のファイルを追加・削除して全ページをリロードさせるため、他の E2E の後に実行する
    {
      name: 'live',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /live-reload\.spec\.js/,
      dependencies: ['chromium'],
    },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), MLV_CONFIG: GENERATED_CONFIG },
  },
});
