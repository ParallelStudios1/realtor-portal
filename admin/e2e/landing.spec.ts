import { test, expect } from '@playwright/test';

test.describe('public landing', () => {
  test('renders hero and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1 })
    ).toContainText(/client portal|10 minutes/i);
    await expect(page.getByRole('link', { name: /start free/i }).first()).toBeVisible();
  });

  test('mobile nav still shows CTA', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width >= 768, 'desktop nav has different layout');
    await page.goto('/');
    await expect(page.getByRole('link', { name: /start free/i }).first()).toBeVisible();
  });

  test('signup link routes to /signup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /start free/i }).first().click();
    await expect(page).toHaveURL(/\/signup/);
  });
});
