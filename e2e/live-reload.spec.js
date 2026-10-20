import { test, expect } from '@playwright/test';
import { writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ファイルの追加・変更・削除を伴うため、playwright.config.js の 'live' project として
// 他の E2E がすべて終わってから直列に実行する（追加・削除は開いている全ページを
// リロードさせるので、並列だと他のテストを妨げる）。
// 作るファイルは _tmp- で始め .gitignore 済み。中断しても追跡ファイルを汚さない
test.describe.configure({ mode: 'serial' });

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vault', 'special');

// サーバは SSE クライアント登録後に最初の書き込みを行うため、レスポンス受信 = 登録済み。
// これを待たずにファイルを書き換えると reload イベントを取りこぼす
async function gotoAndWaitLive(page, url) {
  const connected = page.waitForResponse((r) => r.url().endsWith('/api/live'));
  await page.goto(url);
  await connected;
}

test('日本語名のページもファイル保存で自動リロードされる', async ({ page, request }) => {
  const file = join(DIR, '_tmp-ライブ.md');
  const url = '/special/' + encodeURIComponent('_tmp-ライブ') + '/';
  writeFileSync(file, '# ライブ\n\nbefore\n');
  try {
    await expect.poll(async () => (await request.get(url)).status()).toBe(200);
    await gotoAndWaitLive(page, url);
    await expect(page.locator('main.prose')).toContainText('before');

    writeFileSync(file, '# ライブ\n\nafter\n');

    await expect(page.locator('main.prose')).toContainText('after', { timeout: 10_000 });
  } finally {
    rmSync(file, { force: true });
  }
});

test('ファイルを追加すると開いているページがリロードされ、サイドバーに現れる', async ({ page }) => {
  const file = join(DIR, '_tmp-新規.md');
  try {
    await gotoAndWaitLive(page, '/special/links/');
    await expect(page.locator('details[data-path="special"]')).toHaveAttribute('open', '');

    writeFileSync(file, '# 新規\n');

    await expect(page.locator('#sidebar-tree a', { hasText: '_tmp-新規' })).toBeVisible({ timeout: 10_000 });
  } finally {
    rmSync(file, { force: true });
  }
});

// ブラウザは同じホストへの HTTP/1.1 接続を 6 本までに制限する。SSE は接続を張りっぱなしにするので、
// 1 ページで何本も開くと数タブで使い切り、ツリー取得などが待たされてサイドバーが空のまま止まる
test('SSE は 1 ページにつき 1 本だけ開き、タブを 3 つ開いてもサイドバーが表示される', async ({ context }) => {
  const pages = [];
  let liveRequests = 0;
  context.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/live') liveRequests++;
  });
  for (let i = 0; i < 3; i++) {
    const page = await context.newPage();
    await page.goto('/a/b/c/');
    pages.push(page);
  }
  for (const page of pages) {
    await expect(page.locator('#sidebar-tree a').first()).toBeVisible({ timeout: 5_000 });
  }
  expect(liveRequests).toBe(3);
});
