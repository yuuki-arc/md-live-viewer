import { test, expect } from '@playwright/test';

test('mermaid フェンスは pre.mermaid として配信される', async ({ request }) => {
  // クライアント側で mermaid が描画する前の、サーバ配信 HTML を検証する
  const res = await request.get('/mermaid/');
  const html = await res.text();
  expect(html).toContain('<pre class="mermaid">');
  expect(html).toContain('flowchart TB');
});

test('CDN 到達可能なら図が SVG に描画される', async ({ page }) => {
  await page.goto('/mermaid/');
  await expect(page.locator('pre.mermaid svg')).toBeVisible({ timeout: 15_000 });
});

test('CDN に到達できない場合はコードブロック表示のままになる', async ({ page }) => {
  // jsDelivr への全リクエストを遮断してオフライン相当にする
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  // フォールバック経路（import 失敗の warn）が走り切るのを待ってから検証する
  const warned = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('mermaid を CDN から読み込めませんでした'),
    timeout: 15_000,
  });
  await page.goto('/mermaid/');
  await warned;

  const pre = page.locator('pre.mermaid');
  await expect(pre).toBeVisible();
  // ソースがそのまま残り、SVG に置換されない
  await expect(pre).toContainText('flowchart TB');
  await expect(pre.locator('svg')).toHaveCount(0);
  await expect(pre).not.toHaveAttribute('data-processed', 'true');
});
