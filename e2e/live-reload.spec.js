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
  // 最初の接続から ?since= が付くので、パスで判定する
  const connected = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live');
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
  const counts = new Map();
  for (let i = 0; i < 3; i++) {
    const page = await context.newPage();
    // 直前のテストのファイル削除の通知を ?since= で受け取って読み込み直すことがあるので、
    // 合計ではなく、ページを読み込むたびに数え直して 1 本ずつであることを確かめる
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) counts.set(page, 0); });
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/live') counts.set(page, (counts.get(page) || 0) + 1);
    });
    await page.goto('/a/b/c/');
    pages.push(page);
  }
  for (const page of pages) {
    await expect(page.locator('#sidebar-tree a').first()).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => counts.get(page)).toBe(1);
  }
});

// Playwright のページはどれも表示中として扱われるので、visibilityState を差し替えて
// タブが裏に回った・表に戻ったときの動きを再現する
async function setVisibility(page, visibility) {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visibility);
}

const liveState = (page) => page.evaluate(async () => (await import('/assets/js/live.js')).liveEvents.readyState);

test('裏に回ったタブは SSE を閉じ、表に戻るとつなぎ直す', async ({ page }) => {
  await gotoAndWaitLive(page, '/a/b/c/');
  await setVisibility(page, 'hidden');
  await expect.poll(() => liveState(page)).toBe(2);
  await setVisibility(page, 'visible');
  await expect.poll(() => liveState(page)).toBe(1);
});

test('裏に回っている間に保存した変更は、表に戻ったときに反映される', async ({ page, request }) => {
  const file = join(DIR, '_tmp-裏.md');
  const url = '/special/' + encodeURIComponent('_tmp-裏') + '/';
  writeFileSync(file, '# 裏\n\nbefore\n');
  try {
    await expect.poll(async () => (await request.get(url)).status()).toBe(200);
    await gotoAndWaitLive(page, url);
    await setVisibility(page, 'hidden');
    await expect.poll(() => liveState(page)).toBe(2);

    writeFileSync(file, '# 裏\n\nafter\n');
    // 裏に回っている間は通知が届かないので、まだ古い内容のまま
    await expect.poll(async () => (await request.get(url)).text()).toContain('after');
    await expect(page.locator('main.prose')).toContainText('before');

    await setVisibility(page, 'visible');
    await expect(page.locator('main.prose')).toContainText('after', { timeout: 10_000 });
  } finally {
    rmSync(file, { force: true });
  }
});

test('タブを 8 つ開いても、裏のタブは接続を持たないのでサイドバーが表示される', async ({ context }) => {
  const pages = [];
  for (let i = 0; i < 8; i++) {
    const page = await context.newPage();
    await page.goto('/a/b/c/');
    await expect(page.locator('#sidebar-tree a').first()).toBeVisible({ timeout: 5_000 });
    // 次のタブを開くと、それまでのタブは裏に回る
    await setVisibility(page, 'hidden');
    pages.push(page);
  }
  for (const page of pages) await expect.poll(() => liveState(page)).toBe(2);
});

// HTML に埋め込んだ id を最初の位置にするので、ページを返してから SSE がつながるまでの変更や、
// 裏で開いて表示する前の変更も取りこぼさない
test('最初の SSE 接続から、ページに埋め込んだ id を since で渡す', async ({ page }) => {
  const live = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/live');
  await page.goto('/a/b/c/');
  const since = new URL((await live).url()).searchParams.get('since');
  expect(since).toBe(await page.locator('meta[name="mlv-live-id"]').getAttribute('content'));
  expect(since).toMatch(/^[0-9a-f]+-\d+$/);
});
