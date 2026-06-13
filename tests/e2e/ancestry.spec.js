// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';

const TINY_RAW = path.resolve('tests/fixtures/tiny-raw.txt');

test.describe('Ancestry — per-individual', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('asili');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/beta');
  });

  test('ancestry can be set during initial setup', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TINY_RAW);

    const nameInput = page.locator('.individual-setup__input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('AncestryTest');

    // Select ancestry
    const ancestrySelect = page.locator('.individual-setup__ancestry select');
    await expect(ancestrySelect).toBeVisible();
    await ancestrySelect.selectOption('EAS');

    // Submit
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });

    // Verify ancestry saved to IDB
    const ancestry = await page.evaluate(async () => {
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
      return /** @type {Array<any>} */ (all)[0]?.ancestry;
    });
    expect(ancestry).toBe('EAS');
  });

  test('ancestry can be changed in settings edit', async ({ page }) => {
    // Upload and setup with default ancestry
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TINY_RAW);
    const nameInput = page.locator('.individual-setup__input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('EditTest');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });

    // Open settings
    const settingsBtn = page.locator('button[title="Settings"], button:has(app-icon[name="settings"])').first();
    await settingsBtn.click();
    await expect(page.locator('.settings-drawer')).toBeVisible({ timeout: 5_000 });

    // Click individual to open edit
    await page.locator('.individual-list__select').first().click();
    await expect(page.locator('.individual-list__edit')).toBeVisible({ timeout: 5_000 });

    // Change ancestry
    const ancestrySelect = page.locator('.individual-list__edit-ancestry select');
    await expect(ancestrySelect).toBeVisible({ timeout: 5_000 });
    await ancestrySelect.selectOption('AFR');

    // Save
    await page.locator('.individual-list__edit button:has-text("Save")').click();

    // Wait for save to complete and edit to close
    await expect(page.locator('.individual-list__edit')).not.toBeVisible({ timeout: 5_000 });

    // Verify ancestry saved
    const ancestry = await page.evaluate(async () => {
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
      return /** @type {Array<any>} */ (all)[0]?.ancestry;
    });
    expect(ancestry).toBe('AFR');
  });

  test('global ancestry migrates to individuals on load', async ({ page }) => {
    // Setup an individual first
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TINY_RAW);
    const nameInput = page.locator('.individual-setup__input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('MigrateTest');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });

    // Simulate a legacy global ancestry setting and reload
    await page.evaluate(() => localStorage.setItem('ancestry', 'SAS'));
    await page.reload();
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });

    // Verify migration: individual should have ancestry, localStorage cleared
    const result = await page.evaluate(async () => {
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
      return {
        ancestry: /** @type {Array<any>} */ (all)[0]?.ancestry,
        globalCleared: !localStorage.getItem('ancestry'),
      };
    });
    expect(result.ancestry).toBe('SAS');
    expect(result.globalCleared).toBe(true);
  });
});
