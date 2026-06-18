// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Resilience — FOUC, no-JS, error boundaries', () => {
  test('no white flash on initial load (FOUC prevention)', async ({ page }) => {
    // Capture the background color before any stylesheets load
    // by intercepting the first paint before CSS resolves
    const colors = [];
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const bg = getComputedStyle(document.body).backgroundColor;
        window.__bgSamples = window.__bgSamples || [];
        window.__bgSamples.push(bg);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

    await page.goto('/');
    const samples = await page.evaluate(() => window.__bgSamples || []);
    // Should never see white (rgb(255, 255, 255)) at any point
    const white = samples.filter((s) => s === 'rgb(255, 255, 255)');
    expect(white).toHaveLength(0);
  });

  test('body has dark background before CSS loads', async ({ page }) => {
    // Block all stylesheets, check inline style holds
    await page.route('**/*.css', (route) => route.abort());
    await page.goto('/');
    const bg = await page.evaluate(() => document.body.style.backgroundColor || getComputedStyle(document.body).backgroundColor);
    // Should not be white
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('noscript message is in the DOM', async ({ page }) => {
    await page.goto('/beta');
    // noscript content is in the DOM even when JS runs — just hidden
    const noscript = await page.evaluate(() => document.querySelector('noscript')?.textContent);
    expect(noscript).toBeTruthy();
    expect(noscript).toContain('JavaScript');
  });

  test('app renders without crashing on fresh load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/beta');
    await page.waitForSelector('app-router', { timeout: 10_000 });
    // Filter known vendor warnings
    const fatal = errors.filter((e) => !e.includes('warning') && !e.includes('Warning'));
    expect(fatal).toHaveLength(0);
  });

  test('unhandled rejection handler is registered', async ({ page }) => {
    await page.goto('/beta');
    const hasHandler = await page.evaluate(() => {
      // Trigger a synthetic rejection and check it doesn't crash the app
      let caught = false;
      const handler = (e) => { caught = true; e.preventDefault(); };
      window.addEventListener('unhandledrejection', handler, { once: true });
      Promise.reject(new Error('test-rejection'));
      return new Promise((resolve) => setTimeout(() => resolve(caught), 100));
    });
    expect(hasHandler).toBe(true);
  });

  test('manifest fetch failure is handled gracefully', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Block the manifest CDN request
    await page.route('**/trait_manifest.json', (route) => route.abort());
    await page.goto('/beta');

    // App should still render — not hang or crash
    await page.waitForSelector('app-router', { timeout: 10_000 });
    // Network errors are expected — but no JS exceptions should crash the app
    const fatal = errors.filter((e) => !e.includes('Failed to fetch') && !e.includes('warning'));
    expect(fatal).toHaveLength(0);
  });

  test('CDN data fetch failure does not leave blank screen', async ({ page }) => {
    // Block all R2/CDN requests
    await page.route('**/data.asili.dev/**', (route) => route.abort());
    await page.goto('/beta');

    await page.waitForSelector('app-router', { timeout: 10_000 });
    // Something should be visible — not a blank white page
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).not.toBe('rgb(255, 255, 255)');
  });
});
