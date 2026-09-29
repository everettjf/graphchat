// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICodexAuthManager } from "./openai-codex-auth.js";

const directories: string[] = [];

async function setup(credentials?: Record<string, unknown>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-auth-"));
  directories.push(directory);
  const authPath = path.join(directory, "auth.json");
  if (credentials) fs.writeFileSync(authPath, JSON.stringify(credentials));
  const runtime = await ModelRuntime.create({
    authPath,
    modelsPath: path.join(directory, "models.json"),
    refreshOnCreate: false,
  });
  return { authPath, runtime };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("OpenAICodexAuthManager", () => {
  it("detects and removes a ChatGPT login stored in Pi's auth.json", async () => {
    const { authPath, runtime } = await setup({
      "openai-codex": {
        type: "oauth",
        access: "test-access-token",
        refresh: "test-refresh-token",
        expires: Date.now() + 60_000,
        accountId: "account-test",
      },
    });
    const manager = new OpenAICodexAuthManager(runtime);
    await expect(manager.getStatus()).resolves.toMatchObject({ state: "authenticated" });
    await expect(manager.logout()).resolves.toEqual({ state: "signed_out" });
    expect(fs.readFileSync(authPath, "utf8")).not.toContain("test-refresh-token");
    await expect(manager.getStatus()).resolves.toEqual({ state: "signed_out" });
  });

  it("starts Pi's OpenAI device-code flow without exposing credentials", async () => {
    const { runtime } = await setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/accounts/deviceauth/usercode")) {
        return new Response(
          JSON.stringify({ device_auth_id: "device-test", user_code: "ABCD-EFGH", interval: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/accounts/deviceauth/token")) {
        return new Response("", { status: 403 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const manager = new OpenAICodexAuthManager(runtime);

    await expect(manager.start()).resolves.toMatchObject({
      state: "pending",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.openai.com/codex/device",
    });
    await manager.logout();
    expect(fetchMock).toHaveBeenCalled();
  });
});
