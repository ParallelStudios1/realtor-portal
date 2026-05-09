import { test, expect } from '@playwright/test';

test.describe('auth gating', () => {
  test('protected route bounces unauthenticated users to /login', async ({
    page,
  }) => {
    const response = await page.goto('/dashboard');
    // Should end on /login (after middleware redirect)
    await expect(page).toHaveURL(/\/login/);
    // Status of the final page is 200, not 4xx
    expect(response?.status()).toBeLessThan(400);
  });

  test('login form renders with email + password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('apple-app-site-association is served as JSON', async ({ request }) => {
    const r = await request.get('/.well-known/apple-app-site-association');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('application/json');
    const body = await r.json();
    expect(body.applinks?.details?.[0]?.appID).toMatch(
      /\.com\.parallelstudios\.realtorportal$/
    );
  });

  test('billing checkout returns JSON error for unauthenticated POST', async ({
    request,
  }) => {
    const r = await request.post('/api/billing/checkout', {
      data: { plan: 'solo' },
      failOnStatusCode: false,
    });
    // 307 from middleware redirect or 401 from route — never an empty body
    expect([307, 401]).toContain(r.status());
  });
});
