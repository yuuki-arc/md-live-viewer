import { test, expect } from '@playwright/test';

// Playwright は既定で back-forward cache を無効にして Chrome を起動するが、普段の Chrome では有効。
// bfcache に入ったページの SSE が張られたままだと、数ページ移動しただけで同じホストへの接続上限（6 本）を
// 使い切り、ツリー取得などが待たされてサイドバーが空のまま止まる
// 同梱の Chromium（headless shell）は bfcache を使わないので、インストール済みの Chrome で確かめる
test.use({ channel: 'chrome', launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } });

const PAGES = ['/a/b/c/', '/a/b/d/', '/a/e/', '/top/', '/z/y/', '/mermaid/', '/special/links/', '/special/heading-target/'];

test('bfcache が有効でも、何ページ移動してもサイドバーが表示される', async ({ page }) => {
  for (let round = 0; round < 2; round++) {
    for (const url of PAGES) {
      await page.goto(url);
      await expect(page.locator('#sidebar-tree a').first()).toBeVisible({ timeout: 5_000 });
    }
  }
});

test('bfcache から戻ったページでも SSE がつながり直す', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.evaluate(() => { window.__restored = true; });
  await page.goto('/a/e/');
  // bfcache から復元されると load は発火しないので、commit まで待つ
  await page.goBack({ waitUntil: 'commit' });
  // bfcache から復元されたこと（読み込み直されていない）を確かめる
  expect(await page.evaluate(() => window.__restored)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await import('/assets/js/live.js')).liveEvents.readyState)).toBe(1);
});
