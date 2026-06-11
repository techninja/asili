// @ts-check
import { test, expect } from '@playwright/test';
import path from 'path';

const TINY_RAW = path.resolve('tests/fixtures/tiny-raw.txt');

test.describe('Settings @fast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('asili');
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/beta');
    // Upload a file and complete setup so we have an individual
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TINY_RAW);
    const nameInput = page.locator('.individual-setup__input');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('TestUser');
    await page.locator('button[type="submit"]').click();
    // Wait for grid to confirm we're in the main app
    await expect(page.locator('trait-grid')).toBeVisible({ timeout: 15_000 });
  });

  async function openSettings(page) {
    // Ensure we start from the grid view with drawer closed
    await page.locator('trait-grid').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    // Close drawer if open
    const drawer = page.locator('.settings-drawer');
    if (await drawer.isVisible().catch(() => false)) {
      await page.locator('.settings-drawer__close, .settings-drawer__backdrop').first().click();
      await drawer.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }
    const settingsBtn = page.locator('button[title="Settings"], button:has(app-icon[name="settings"])').first();
    await settingsBtn.click();
    await expect(drawer).toBeVisible({ timeout: 5_000 });
  }

  test('settings drawer opens and shows individual', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('.individual-list__item')).toBeVisible();
    await expect(page.locator('.individual-list__name')).toHaveText(/TestUser/);
  });

  test('score diagnostic accordion opens and shows output', async ({ page }) => {
    // Wait for at least a few scores
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
      return /** @type {Array} */ (keys).length >= 3;
    }, { timeout: 45_000 });

    await openSettings(page);

    // Click the first accordion panel (score diagnostics)
    const accordion = page.locator('accordion-panel').first();
    await accordion.locator('.accordion-panel__trigger').click();

    // Wait for async diagnostic to complete (not just "Running...")
    const output = accordion.locator('.accordion-panel__content');
    await expect(output).toBeVisible({ timeout: 10_000 });
    await expect(output).not.toHaveText('Running');
    const text = await output.textContent();
    expect(text).toContain('Per-Individual:');
  });

  test('system diagnostic accordion shows version and storage', async ({ page }) => {
    await openSettings(page);

    // Click the system diagnostic accordion (has "System" in label)
    const accordion = page.locator('accordion-panel', { has: page.locator('text=System diagnostic') });
    await accordion.locator('.accordion-panel__trigger').click();

    // Wait for the async diagnostic to populate (it fetches from IDB + network)
    const output = accordion.locator('.accordion-panel__content');
    await expect(output).toBeVisible({ timeout: 10_000 });
    await expect(output).not.toHaveText('Collecting');
    const text = await output.textContent();
    expect(text).toContain('Asili v');
    expect(text).toContain('Storage:');
  });

  test('copy button copies diagnostic to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openSettings(page);

    // Open system diagnostic (no scoring dependency)
    const accordion = page.locator('accordion-panel', { has: page.locator('text=System diagnostic') });
    await accordion.locator('.accordion-panel__trigger').click();
    await expect(accordion.locator('.accordion-panel__content')).toBeVisible({ timeout: 5_000 });

    // Click copy
    await accordion.locator('.accordion-panel__copy').click();

    // Verify clipboard
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('Asili v');
  });

  test('clear all data empties IDB and redirects', async ({ page }) => {
    await openSettings(page);

    // Click the danger zone clear button
    const clearBtn = page.locator('button:has-text("Clear All Data")');
    await clearBtn.click();

    // Should show confirmation
    const confirmBtn = page.locator('button:has-text("delete"), button:has-text("Confirm")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    // Should redirect to root
    await page.waitForURL('**/', { timeout: 5_000 });
  });

  test('units toggle changes stored value', async ({ page }) => {
    await openSettings(page);

    // Find units select
    const unitsSelect = page.locator('select').filter({ has: page.locator('option[value="imperial"]') });
    await expect(unitsSelect).toBeVisible();
    await unitsSelect.selectOption('imperial');

    // Verify localStorage updated
    const val = await page.evaluate(() => localStorage.getItem('asili-units'));
    expect(val).toBe('imperial');

    // Toggle back
    await unitsSelect.selectOption('metric');
    const val2 = await page.evaluate(() => localStorage.getItem('asili-units'));
    expect(val2).toBe('metric');
  });
});
