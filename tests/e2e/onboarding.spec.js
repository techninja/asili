// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';

const TINY_RAW = path.resolve('tests/fixtures/tiny-raw.txt');

test.describe('Onboarding — first individual', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('asili');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/beta');
  });

  /** Helper: upload file and complete the setup form */
  async function uploadAndSetup(page) {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TINY_RAW);
    // Wait for the setup form to appear
    const nameInput = page.locator('.individual-setup__input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    // Clear and type a name to ensure the submit button is enabled
    await nameInput.fill('TestUser');
    // Click Score button
    await page.locator('button[type="submit"]').click();
  }

  test('upload raw DNA file creates individual', async ({ page }) => {
    await uploadAndSetup(page);

    // Should create an individual and show the trait grid
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });

    // Verify individual exists in IDB
    const indCount = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('asili', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = /** @type {IDBDatabase} */ (db).transaction('individuals', 'readonly');
      const all = await new Promise(r => {
        const req = tx.objectStore('individuals').getAll();
        req.onsuccess = () => r(req.result);
      });
      return /** @type {Array} */ (all).length;
    });
    expect(indCount).toBeGreaterThanOrEqual(1);
  });

  test('trait grid shows cards after upload', async ({ page }) => {
    await uploadAndSetup(page);

    // Wait for grid and cards (CI is slower — allow time for manifest fetch + render)
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });
    const cards = page.locator('trait-card');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('scoring starts after setup', async ({ page }) => {
    await uploadAndSetup(page);

    // Tiny file scores very fast — verify scoring ran by checking IDB results
    await page.waitForFunction(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('asili', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = /** @type {IDBDatabase} */ (db).transaction('results', 'readonly');
      const keys = await new Promise(r => {
        const req = tx.objectStore('results').getAllKeys();
        req.onsuccess = () => r(req.result);
      });
      return /** @type {Array} */ (keys).length > 0;
    }, { timeout: 45_000 });
  });

  test('scoring completes for tiny file', async ({ page }) => {
    await uploadAndSetup(page);

    // Wait for at least one result to be stored (tiny file scores fast)
    await page.waitForFunction(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('asili', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = /** @type {IDBDatabase} */ (db).transaction('results', 'readonly');
      const keys = await new Promise(r => {
        const req = tx.objectStore('results').getAllKeys();
        req.onsuccess = () => r(req.result);
      });
      return /** @type {Array} */ (keys).length > 0;
    }, { timeout: 60_000 });
  });
});
