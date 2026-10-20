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

test('初回ツリー取得が一過性に失敗してもリトライで自己回復する', async ({ page }) => {
  // node --watch の再起動窓を再現: root の /api/tree を初回だけ失敗させる
  let rootCalls = 0;
  await page.route('**/api/tree?path=', async (route) => {
    rootCalls += 1;
    if (rootCalls === 1) return route.abort();
    return route.continue();
  });

  await page.goto('/a/b/c/');

  // リトライによりツリーが描画され、祖先展開も成立する
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');
  await expect(page.locator('#sidebar-tree .tree-error')).toHaveCount(0);
  expect(rootCalls).toBeGreaterThanOrEqual(2);
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

// 同じ検索結果から次々にページを開けるよう、検索文字列はタブごと（sessionStorage）に覚えておく
test('検索文字列はページを移動しても残り、同じ検索結果のメニューが表示される', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('#sidebar-search').fill('d');
  const results = page.locator('#sidebar-tree a');
  await expect(results.first()).toBeVisible();
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);
  const hrefs = await results.evaluateAll((as) => as.map((a) => a.getAttribute('href')));

  // 結果から別のページを開く
  const next = hrefs.find((h) => h !== '/a/b/c/');
  await page.locator(`#sidebar-tree a[href="${next}"]`).click();
  await expect(page).toHaveURL(next);

  await expect(page.locator('#sidebar-search')).toHaveValue('d');
  await expect.poll(() => results.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(hrefs);
  // 結果の中で今のページがわかる
  await expect(page.locator('#sidebar-tree a.is-active')).toHaveAttribute('href', next);
});

test('検索をクリアすると、次のページでもツリーに戻る', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('#sidebar-search').fill('d');
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);
  await page.locator('#sidebar-search').fill('');
  await expect(page.locator('details[data-path="a/b"]')).toHaveAttribute('open', '');

  await page.goto('/a/e/');
  await expect(page.locator('#sidebar-search')).toHaveValue('');
  await expect(page.locator('details[data-path="a"]')).toHaveAttribute('open', '');
});

test('検索をクリアした直後に打ち直しても、遅れて届いたツリーで検索結果が上書きされない', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('#sidebar-search').fill('d');
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);

  // クリアで始まるツリーの取得を、打ち直して検索結果が出るまで止めておく
  let releaseTree;
  const treeHeld = new Promise((r) => { releaseTree = r; });
  let treeRequested;
  const requested = new Promise((r) => { treeRequested = r; });
  await page.route('**/api/tree?path=', async (route) => {
    treeRequested();
    await treeHeld;
    await route.continue();
  });
  await page.locator('#sidebar-search').fill('');
  await requested;
  await page.locator('#sidebar-search').fill('d');
  await expect(page.locator('#sidebar-tree a').first()).toBeVisible();

  // 止めていたツリーの応答を返しても、検索結果のまま
  const treeResponded = page.waitForResponse('**/api/tree?path=');
  releaseTree();
  await treeResponded;
  await expect(page.locator('#sidebar-tree a').first()).toBeVisible();
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);
  await expect(page.locator('#sidebar-search')).toHaveValue('d');
});

test('ページを開いたときに検索の復元が失敗しても、再試行できる', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('#sidebar-search').fill('d');
  await expect(page.locator('details[data-path="a/b"]')).toHaveCount(0);

  // 自動のリトライも含めて失敗させ、再試行ボタンが出てから通す
  let failing = true;
  await page.route('**/api/search?*', (route) => (failing ? route.abort() : route.continue()));
  await page.goto('/a/e/');
  const retry = page.locator('.tree-error__retry');
  await expect(retry).toBeVisible();
  failing = false;
  await retry.click();
  await expect(page.locator('#sidebar-tree a').first()).toBeVisible();
  await expect(page.locator('#sidebar-search')).toHaveValue('d');
});

test('検索結果が 0 件なら、そのことを表示する（ページを移動しても空のサイドバーにならない）', async ({ page }) => {
  await page.goto('/a/b/c/');
  await page.locator('#sidebar-search').fill('zzqqxxnothing');
  await expect(page.locator('#sidebar-tree .tree-empty')).toBeVisible();
  await page.goto('/a/e/');
  await expect(page.locator('#sidebar-search')).toHaveValue('zzqqxxnothing');
  await expect(page.locator('#sidebar-tree .tree-empty')).toBeVisible();
});
