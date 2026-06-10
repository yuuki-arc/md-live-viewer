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

test('祖先の自動展開は永続化せず、ユーザーの手動開閉状態を保持する', async ({ page }) => {
  // ユーザーが手動で z を開いた状態を再現
  await page.addInitScript(() => {
    localStorage.setItem('md-live-viewer-open:fixture', JSON.stringify(['z']));
  });
  await page.goto('/a/b/c/');

  // 祖先 a / a/b は自動展開され、手動で開いた z も開いたまま共存する
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');
  await expect(page.locator('details[data-path="z"]')).toHaveAttribute('open', '');

  // 永続化されるのは手動の z のみ。自動展開した a / a/b は保存しない
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('md-live-viewer-open:fixture') || '[]'),
  );
  expect(stored).toContain('z');
  expect(stored).not.toContain('a');
  expect(stored).not.toContain('a/b');
});

test('検索をクリアすると祖先展開が復元される', async ({ page }) => {
  await page.goto('/a/b/c/');
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');

  // 検索するとツリーはフラットな結果リストに置き換わる
  await page.locator('#sidebar-search').fill('d');
  await expect(page.locator('#sidebar-tree a', { hasText: 'd' }).first()).toBeVisible();
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);

  // クリアすると祖先展開とアクティブ葉が復元される
  await page.locator('#sidebar-search').fill('');
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');
  await expect(page.locator('a.is-active')).toHaveAttribute('href', '/a/b/c/');
});

test('祖先展開で各階層の /api/tree は1回だけ取得される（二重フェッチ防止）', async ({ page }) => {
  const counts = {};
  await page.route('**/api/tree*', async (route) => {
    const p = new URL(route.request().url()).searchParams.get('path') || '';
    counts[p] = (counts[p] || 0) + 1;
    await route.continue();
  });

  await page.goto('/a/b/c/');
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');

  expect(counts['a']).toBe(1);
  expect(counts['a/b']).toBe(1);
});
