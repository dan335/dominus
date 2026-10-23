// Browser tests for Dominus. tests/e2e/run.sh starts the app and runs them;
// see README.md.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  // one app and one database: the specs run one after another
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 3 * 60 * 1000,
  expect: { timeout: 20 * 1000 },
  reporter: [['list'], ['html', { outputFolder: process.env.E2E_REPORT || '../../.test-results/e2e/report', open: 'never' }]],
  outputDir: process.env.E2E_OUTPUT || '../../.test-results/e2e/output',
  use: {
    baseURL: process.env.E2E_URL || 'http://localhost:3000',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 20 * 1000,
    navigationTimeout: 2 * 60 * 1000
  }
});
