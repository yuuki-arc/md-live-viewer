import { test, expect } from '@playwright/test';

// 存在しない slug を使う。万一検証をすり抜けても vault 切替（再インデックス）が走らず、
// 並列実行中の他の E2E を壊さない（すり抜けた場合は 400 になる）
test('他サイトの Origin からの vault 切替は 403', async ({ request }) => {
  const res = await request.post('/api/switch', {
    headers: { Origin: 'http://evil.example' },
    data: { slug: '__no_such_vault__' },
  });
  expect(res.status()).toBe(403);
});

test('localhost 系以外の Host（DNS リバインディング）は 403', async ({ request }) => {
  const res = await request.get('/api/vaults', { headers: { Host: 'evil.example:7778' } });
  expect(res.status()).toBe(403);
});

test('同一オリジンからのアクセスは通る', async ({ page }) => {
  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page.locator('#sidebar-tree a').first()).toBeVisible();
});
