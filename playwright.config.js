import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'artifacts/chromium',
  reporter: [
    ['list'],
    ['html', {open: 'never', outputFolder: 'artifacts/chromium-report'}]
  ],
  workers: 1,
  timeout: 30000
});
