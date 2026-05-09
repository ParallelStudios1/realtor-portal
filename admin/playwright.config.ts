import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the admin web app.
 *
 * Local: `BASE_URL=http://localhost:3000 npm run e2e`
 * Prod-smoke: `BASE_URL=https://realtor-portal-ten.vercel.app npm run e2e`
 *
 * For tests that need an authed user, set TEST_USER_EMAIL + TEST_USER_PASSWORD
 * (a dedicated CI account; never your real one).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],
});
