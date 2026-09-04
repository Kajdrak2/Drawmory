import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DRAWMORY_REVEAL_SECONDS: '2',
      DRAWMORY_REDRAW_SECONDS: '4',
      DRAWMORY_CONFIRMATION_SECONDS: '2',
      DRAWMORY_LOCATION_SECONDS: '60',
      DRAWMORY_CLAIM_SECONDS: '60',
      DRAWMORY_ADMIN_CAPABILITY: 'test-admin-capability-0123456789abcdef-0123456789abcdef',
      DRAWMORY_ADMIN_SESSION_SECRET: 'test-admin-session-secret-fedcba9876543210-fedcba9876543210',
      DRAWMORY_EPHEMERAL_STATE: '1',
    },
  },
});
