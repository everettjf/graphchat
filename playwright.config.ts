import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localChrome = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

// Stable path: the config is evaluated in the runner and in each worker, so a
// pid-based name would differ between the seeded server and the test workers.
const piSessionDir = path.join(os.tmpdir(), "pi-graph-chat-e2e-sessions");
const piAgentDir = path.join(os.tmpdir(), "pi-graph-chat-e2e-agent");
const projectDir = path.join(os.tmpdir(), "pi-graph-chat-e2e-project");
process.env.PI_CODING_AGENT_SESSION_DIR = piSessionDir;
process.env.PI_GRAPH_CHAT_E2E_PROJECT_DIR = projectDir;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/seed-pi-sessions.ts",
  fullyParallel: false,
  // Every spec shares one server and one SQLite database; files must not interleave.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: localChrome ? { executablePath: localChrome } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun dist-server/server/index.js",
    url: "http://127.0.0.1:4173/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PORT: "4173",
      GRAPHCHAT_DATA_DIR: path.join(os.tmpdir(), `graphchat-e2e-${process.pid}`),
      PI_CODING_AGENT_SESSION_DIR: piSessionDir,
      // Keep Pi auth and settings away from the developer's real ~/.pi.
      PI_CODING_AGENT_DIR: piAgentDir,
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
