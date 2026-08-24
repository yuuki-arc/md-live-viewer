import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vault');

test('/_raw/ はファイルの中身を text/plain でそのまま返す', async ({ request }) => {
  const res = await request.get('/_raw/a/b/c/');

  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(await res.text()).toBe(readFileSync(join(VAULT, 'a', 'b', 'c.md'), 'utf8'));
});

test('末尾スラッシュが無い /_raw/ パスも同じ内容を返す', async ({ request }) => {
  const res = await request.get('/_raw/top');

  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(readFileSync(join(VAULT, 'top.md'), 'utf8'));
});

test('index に無いパスは 404', async ({ request }) => {
  expect((await request.get('/_raw/nope/')).status()).toBe(404);
  expect((await request.get('/_raw/')).status()).toBe(404);
});

test('raw ビューにはビューアの HTML シェルもクライアント JS も含まれない', async ({ page }) => {
  const requested = [];
  page.on('request', (req) => requested.push(new URL(req.url()).pathname));

  await page.goto('/_raw/a/b/c/');

  await expect(page.locator('#sidebar-tree')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toHaveCount(0);
  expect(requested).toEqual(['/_raw/a/b/c/']);
});

test('通常ページのフッタから raw ビューへ辿れる', async ({ page }) => {
  await page.goto('/a/b/c/');

  const rawLink = page.locator('.site-footer a.raw-link');
  await expect(rawLink).toHaveAttribute('href', '/_raw/a/b/c/');

  await rawLink.click();
  await expect(page).toHaveURL(/\/_raw\/a\/b\/c\/$/);
});

test('index ページには raw リンクを出さない', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('a.raw-link')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('{{rawLink}}');
});
