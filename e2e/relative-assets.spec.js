import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'source');

// ページは /<dir>/<name>/ で配信されるが、隣の画像はファイル基準の相対パスで書かれる
test('Markdown の隣にある画像を相対パスの <img> で表示できる', async ({ page }) => {
  await page.goto('/media/gallery/');
  const img = page.locator('main.prose img[alt="dot"]');
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el) => el.naturalWidth)).toBe(10);
});

test('Markdown の隣にある画像への相対リンクを開ける', async ({ page }) => {
  await page.goto('/media/gallery/');
  const href = await page.locator('main.prose a', { hasText: '図へのリンク' }).getAttribute('href');
  const res = await page.request.get(new URL(href, page.url()).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/svg+xml');
  expect(await res.text()).toBe(readFileSync(join(FIXTURE_DIR, 'media', '図 1.svg'), 'utf8'));
});

test('Markdown 本体やソース外はアセットとして返さない', async ({ request }) => {
  expect((await request.get('/media/gallery.md')).status()).toBe(404);
  expect((await request.get('/media/%2E%2E/%2E%2E/package.json')).status()).toBe(404);
});

// 相対参照はページ URL が末尾 / である前提で書き換えているので、/ なしは正規形へ寄せる
test('末尾 / なしのページ URL は末尾 / 付きへリダイレクトし、画像も表示できる', async ({ page, request }) => {
  const res = await request.get('/media/gallery?x=1', { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe('/media/gallery/?x=1');

  await page.goto('/media/gallery');
  await expect(page).toHaveURL(/\/media\/gallery\/$/);
  const img = page.locator('main.prose img[alt="dot"]');
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el) => el.naturalWidth)).toBe(10);
});
