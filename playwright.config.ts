import { defineConfig } from '@playwright/test';

export default defineConfig({
	 testDir: './tests/e2e',
	 fullyParallel: false,
	 retries: 0,
	 timeout: 30_000,
	 expect: { timeout: 7_500 },
	 reporter: [['list']],
	 use: {
		baseURL: process.env.INPACARE_TEST_URL ?? 'http://127.0.0.1:3000',
		browserName: 'chromium',
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	 }
});
