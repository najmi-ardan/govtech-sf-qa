import { defineConfig, devices } from '@playwright/test';
import { config } from './config/env';
import { RUN_ID } from './utils/logger';

// Set in the main process so workers share one run id. Lead data then differs by worker index.
process.env.RUN_ID = RUN_ID;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: config.timeouts.test,
  expect: { timeout: config.timeouts.expect },
  fullyParallel: true,
  forbidOnly: config.isCI,
  retries: config.isCI ? 1 : 0,
  workers: config.workers ?? 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  use: {
    actionTimeout: config.timeouts.action,
    navigationTimeout: config.timeouts.navigation,
    trace: config.isCI ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Singapore',
    viewport: { width: 1600, height: 1000 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /session\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], trace: 'off', video: 'off' },
    },
    {
      name: 'chromium',
      testIgnore: /session\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: config.storageStatePath },
    },
    {
      name: 'webkit',
      testIgnore: /session\.setup\.ts/,
      grep: /@smoke/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: config.storageStatePath },
    },
  ],
});
