import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// このテスト専用のフィクスチャ。他のテストと並列実行しても内容比較が衝突しないよう分けている
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vault', 'special', 'ライブ.md');

test('日本語名のページもファイル保存で自動リロードされる', async ({ page }) => {
  const original = readFileSync(FILE, 'utf8');
  try {
    // サーバは SSE クライアント登録後に最初の書き込みを行うため、レスポンス受信 =
    // 登録済み。これを待たずに書き換えると reload イベントを取りこぼす
    const connected = page.waitForResponse((r) => r.url().endsWith('/api/live'));
    await page.goto('/special/' + encodeURIComponent('ライブ') + '/');
    await connected;
    await expect(page.locator('main.prose')).toContainText('before');

    writeFileSync(FILE, original.replace('before', 'after'));

    await expect(page.locator('main.prose')).toContainText('after', { timeout: 10_000 });
  } finally {
    writeFileSync(FILE, original);
  }
});
