import { test, expect } from '@playwright/test';

test.describe('EJStore E2E Tests', () => {
  test('homepage loads without crash', async ({ page }) => {
    // Go to homepage with a test tenant
    await page.goto('/?v=test');
    
    // Should show either services or "no tenant" page
    // Either is fine as long as no console errors
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('no critical console errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/?v=test');
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (like Firebase permission errors in test env)
    const criticalErrors = errors.filter(e => 
      !e.includes('permission') && 
      !e.includes('Firebase') &&
      !e.includes('auth')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
