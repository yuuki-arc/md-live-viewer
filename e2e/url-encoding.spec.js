import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePath } from '../assets/js/url-path.js';

const VAULT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vault');

// ファイル名に URL の予約文字や非 ASCII を含むページ
const PAGES = [
  { name: 'Q&A', title: 'Q and A' },
  { name: 'C#', title: 'C sharp' },
  { name: '50% off', title: 'Fifty percent' },
  { name: 'メモ', title: 'メモ' },
];

for (const { name, title } of PAGES) {
  test(`"${name}" のページを開ける`, async ({ page }) => {
    const res = await page.goto(encodePath(`/special/${name}/`));
    expect(res.status()).toBe(200);
    await expect(page.locator('main.prose h1')).toHaveText(title);
  });

  test(`"${name}" の Raw リンクから生 Markdown を取得できる`, async ({ page, request }) => {
    await page.goto(encodePath(`/special/${name}/`));
    const href = await page.locator('a.raw-link').getAttribute('href');
    const res = await request.get(href);
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe(readFileSync(join(VAULT, 'special', `${name}.md`), 'utf8'));
  });
}

test('サイドバーのリンクは予約文字をエンコードし、現在ページをハイライトする', async ({ page }) => {
  await page.goto(encodePath('/special/C#/'));
  await expect(page.locator('details[data-path="special"]')).toHaveAttribute('open', '');
  const active = page.locator('#sidebar-tree a.is-active');
  await expect(active).toHaveText('C#');
  await expect(active).toHaveAttribute('href', '/special/C%23/');

  await page.locator('#sidebar-tree a', { hasText: 'Q&A' }).click();
  await expect(page).toHaveURL(/\/special\/Q%26A\/$/);
  await expect(page.locator('main.prose h1')).toHaveText('Q and A');
});

test('検索結果のリンクも予約文字をエンコードする', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sidebar-search').fill('off');
  const link = page.locator('#sidebar-tree a', { hasText: '50% off' });
  await expect(link).toHaveAttribute('href', '/special/50%25%20off/');
});

test('不正なパーセントエスケープは 404', async ({ request }) => {
  expect((await request.get('/special/%E3%83/')).status()).toBe(404);
});
