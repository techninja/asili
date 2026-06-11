import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // serial — shared browser state within files
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // single worker — IndexedDB state is shared
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,

  use: {
    baseURL: 'http://localhost:4242',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    storageState: undefined, // fresh context each test
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'node src/server.js',
    port: 4242,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '4242' },
  },
});
