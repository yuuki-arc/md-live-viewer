import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = join(__dirname, 'e2e', 'fixtures', 'vault');
const GENERATED_CONFIG = join(__dirname, 'e2e', 'fixtures', '.config.generated.json');
const PORT = 7778;

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
    },
    null,
    2,
  ),
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), MLV_CONFIG: GENERATED_CONFIG },
  },
});
