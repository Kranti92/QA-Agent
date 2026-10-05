import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL ?? 'https://sauce-demo.myshopify.com';

export default defineConfig({
  testDir: './tests',

  // Every test gets its own browser context, so every test gets its own
  // Shopify cart cookie. That is what keeps the suite parallel-safe on a
  // store whose cart is server-side session state.
  fullyParallel: true,

  // Deliberately low. The demo store rate-limits /cart/add.js and starts
  // answering 429 "too_many_requests" under heavier load, which looks like
  // flake but is throttling. Raise WORKERS only if you are happy to retry.
  workers: process.env.WORKERS ? Number(process.env.WORKERS) : 2,
  retries: process.env.RETRIES ? Number(process.env.RETRIES) : 2,
  forbidOnly: !!process.env.CI,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    headless: process.env.HEADLESS !== 'false',
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 0) },

    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    // The cart is a full POST + 302, so failures are almost always
    // "which page did we land on" questions. Keep the evidence.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Enable when the cross-browser / responsive scenario groups of SDEMO-1
    // come into scope. The mobile project exercises #cart-target-mobile and
    // the .mobile cart markup, which the desktop viewport hides.
    // { name: 'firefox',       use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',        use: { ...devices['Desktop Safari'] } },
    // { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
});
