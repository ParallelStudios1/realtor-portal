import { test, expect } from '@playwright/test';

/**
 * Public landing smoke tests. The hero copy changes pretty often
 * (Turner rewrites it as he refines positioning), so the assertion is
 * deliberately broad — we check that:
 *   - the h1 actually exists and is non-empty
 *   - the "Start free trial" CTA is present
 *   - the CTA routes to /signup
 *
 * Avoid hardcoding specific marketing phrases here. When you ship copy
 * changes you don't want to chase a smoke test.
 */
test.describe('public landing', () => {
  test('renders hero and CTA', async ({ page }) => {
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    // Any non-empty headline is fine — we just want the page to render.
    await expect(h1).not.toHaveText('');
    await expect(
      page.getByRole('link', { name: /start free trial/i }).first()
    ).toBeVisible();
  });

  test('mobile nav still shows CTA', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width >= 768, 'desktop nav has different layout');
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: /start free trial/i }).first()
    ).toBeVisible();
  });

  test('signup link routes to /signup', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: /start free trial/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/signup/);
  });
});
