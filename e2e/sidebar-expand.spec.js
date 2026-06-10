import { test, expect } from '@playwright/test';

test('深い階層ページは祖先 details を自動展開し、現在地をハイライトする', async ({ page }) => {
  await page.goto('/a/b/c/');

  // 祖先 a / a/b が開く
  await expect(page.locator('details[data-path="a"]')).toHaveAttribute('open', '');
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');

  // 無関係ブランチ z は開いたままにならない
  await expect(page.locator('details[data-path="z"]')).not.toHaveAttribute('open', '');

  // 現在ページの葉が可視かつアクティブ
  const active = page.locator('a.is-active');
  await expect(active).toBeVisible();
  await expect(active).toHaveAttribute('href', '/a/b/c/');
});

test('ルート直下ページは余計な階層を展開しない', async ({ page }) => {
  await page.goto('/top/');

  // top は最上位なので展開すべき祖先が無い
  await expect(page.locator('details[data-path="a"]')).not.toHaveAttribute('open', '');

  const active = page.locator('a.is-active');
  await expect(active).toBeVisible();
  await expect(active).toHaveAttribute('href', '/top/');
});
