// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Anonymous user experience @fast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('asili');
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('welcome page renders with CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a[href="/beta"]')).toBeVisible();
  });

  test('beta landing shows upload prompt when no individuals', async ({ page }) => {
    await page.goto('/beta');
    await expect(page.locator('upload-zone').first()).toBeVisible();
  });

  test('trait detail is linkable with unscored empty state', async ({ page }) => {
    // Enter via beta (router needs stack context)
    await page.goto('/beta');
    await expect(page.locator('upload-zone').first()).toBeVisible();
    // Navigate to trait detail
    await page.goto('/trait/EFO_0004305');
    // Wait for trait name to load from manifest
    await expect(page.locator('.trait-detail__title')).toBeVisible({ timeout: 10_000 });
  });

  test('dark mode detects system preference', async ({ page }) => {
    // Emulate dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/beta');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
    );
    // Dark mode bg should not be white/light
    expect(bg).not.toBe('#ffffff');
    expect(bg).not.toBe('#fff');
  });

  test('theme toggle persists across reload', async ({ page }) => {
    await page.goto('/beta');
    // Find and click theme toggle
    const toggle = page.locator('theme-toggle button, .theme-toggle');
    if (await toggle.isVisible()) {
      await toggle.click();
      const themeAfterClick = await page.evaluate(() => localStorage.getItem('asili-theme'));
      await page.reload();
      const themeAfterReload = await page.evaluate(() => localStorage.getItem('asili-theme'));
      expect(themeAfterReload).toBe(themeAfterClick);
    }
  });
});
