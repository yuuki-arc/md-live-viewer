import { test, expect } from '@playwright/test';

test('/api/sources は設定済みのソース一覧と現在のソースを返す', async ({ request }) => {
  const res = await request.get('/api/sources');
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.current).toBe('fixture');
  expect(data.sources.map((s) => s.slug)).toEqual(['fixture']);
});

test('footer のソース選択に設定済みのソースが並ぶ', async ({ page }) => {
  await page.goto('/top/');
  await expect(page.locator('#source-select option')).toHaveText(['Fixture']);
  await expect(page.locator('#source-select')).toHaveValue('fixture');
});
