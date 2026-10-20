import { test, expect } from '@playwright/test';

// 生成器は playwright.config.js で e2e/fixtures/fake-generator.js に差し替えている。
// キャッシュはテスト開始時に消すが、サーバとキャッシュは全テストで共有なので、
// 生成を伴うテストはそれぞれ別のページを使う

test('既定は Markdown 表示で、表示切替が出る', async ({ page }) => {
  await page.goto('/a/b/c/');

  await expect(page.locator('.view-picker button[data-view="md"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.view-picker button[data-view="rich"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('main.prose h1').first()).toBeVisible();
  await expect(page.locator('.rich-view')).toHaveCount(0);
});

test('Rich に切り替えて生成すると iframe に生成 HTML が表示され、リロード後も Rich のまま', async ({ page }) => {
  await page.goto('/z/y/');
  await page.locator('.view-picker button[data-view="rich"]').click();

  // 未生成なので生成ボタンを出し、Markdown 本文は隠す
  const generate = page.locator('.rich-view button.rich-generate');
  await expect(generate).toBeVisible();
  await expect(page.locator('main.prose > h1')).toBeHidden();

  await generate.click();

  const frame = page.frameLocator('.rich-view iframe');
  await expect(frame.locator('#fake-rich')).toHaveText('FAKE RICH: Y', { timeout: 15_000 });
  await expect(page.locator('.rich-view .rich-meta')).toContainText('node');

  // 生成 HTML が高さを通知し、iframe が内容に合わせて伸びる
  await expect.poll(async () => (await page.locator('.rich-view iframe').boundingBox()).height).toBeGreaterThan(1000);
  // iframe は固有幅しか持たないので、本文の列幅いっぱいに広がっていること（細く縮まない）
  expect((await page.locator('.rich-view iframe').boundingBox()).width).toBeGreaterThan(700);
  // iframe の枠線の分まで含めて伸ばし、iframe 内に縦スクロールバーを出さない
  const richFrame = page.frames().find((f) => f.url().includes('/_rich/'));
  await expect
    .poll(() => richFrame.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight))
    .toBeLessThanOrEqual(0);
  expect(await richFrame.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');

  await page.reload();
  await expect(page.locator('.view-picker button[data-view="rich"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.frameLocator('.rich-view iframe').locator('#fake-rich')).toBeVisible();
});

test('Markdown に戻すと本文が表示され、Rich の表示が消える', async ({ page }) => {
  await page.goto('/a/e/');
  await page.locator('.view-picker button[data-view="rich"]').click();
  await expect(page.locator('.rich-view')).toBeVisible();

  await page.locator('.view-picker button[data-view="md"]').click();

  await expect(page.locator('.rich-view')).toHaveCount(0);
  await expect(page.locator('main.prose > h1')).toBeVisible();
});

test('/_rich/ は未生成なら 404、生成済みなら sandbox の CSP 付きで返す', async ({ request }) => {
  expect((await request.get('/_rich/top/')).status()).toBe(404);

  const res = await request.post('/api/rich/generate', { data: { path: '/top/' } });
  expect(res.status()).toBe(202);
  await expect.poll(async () => (await request.get('/_rich/top/')).status(), { timeout: 15_000 }).toBe(200);

  const rich = await request.get('/_rich/top/');
  expect(rich.headers()['content-security-policy']).toContain('sandbox allow-scripts');
  expect(rich.headers()['content-security-policy']).not.toContain('allow-same-origin');
  expect(await rich.text()).toContain('mlv-rich-height');
});

test('/api/rich は生成状態を返し、index に無いページは 404', async ({ request }) => {
  const res = await request.get('/api/rich?path=' + encodeURIComponent('/a/b/d/'));
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ available: true, exists: false, job: { state: 'idle' } });

  expect((await request.get('/api/rich?path=/nope/')).status()).toBe(404);
  expect((await request.post('/api/rich/generate', { data: { path: '/nope/' } })).status()).toBe(404);
});

test('index ページには表示切替を出さず、Rich モードでも一覧が隠れない', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('.view-picker button[data-view="rich"]').click();

  await page.goto('/');

  await expect(page.locator('.view-picker')).toHaveCount(0);
  await expect(page.locator('ul.root-list')).toBeVisible();
});
