import { test, expect } from '@playwright/test';

test('API explorer requires a session for both its page and contract', async ({ page, request }) => {
    await page.goto('/api-docs');
    await expect(page).toHaveURL(/\/login$/);
    const spec = await request.get('/api-docs/openapi.json');
    expect(spec.status()).toBe(401);
});

test('Swagger renders, reads the API, and sends authenticated CSRF-protected mutations', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('ID petugas').fill('hendra');
    await page.getByLabel('Kata sandi', { exact: true }).fill('InpaCareDemo!2026');
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('link', { name: 'API Explorer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'InpaCare API Explorer', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Database (pgAdmin)' })).toHaveAttribute('href', '/db/');

    const spec = await page.request.get('/api-docs/openapi.json');
    expect(spec.status()).toBe(200);
    expect(spec.headers()['cache-control']).toContain('no-store');
    expect((await spec.json()).servers).toEqual([{ url: '/' }]);

    const patients = page.locator('#operations-Reference-GET_patients');
    await patients.locator('.opblock-summary').click();
    await patients.getByRole('button', { name: 'Try it out' }).click();
    const read = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/patients');
    await patients.getByRole('button', { name: 'Execute', exact: true }).click();
    expect((await read).status()).toBe(200);

    const records = page.locator('#operations-Medical_records-POST_medical_records');
    await records.locator('.opblock-summary').click();
    await records.getByRole('button', { name: 'Try it out' }).click();
    await records.locator('textarea').fill('{}');
    const mutation = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/v1/medical-records');
    await records.getByRole('button', { name: 'Execute', exact: true }).click();
    const response = await mutation;
    // An empty body must reach validation without creating a medical record.
    expect(response.status()).toBe(422);
    const token = (await page.context().cookies()).find(cookie => cookie.name === 'csrf_token')!.value;
    expect(response.request().headers()['x-csrf-token']).toBe(token);
    expect((await response.request().allHeaders()).origin).toBe(new URL(page.url()).origin);
});
