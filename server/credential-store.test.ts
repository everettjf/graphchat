// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileCredentialStore } from "./credential-store.js";
import { OpenAICodexAuthManager } from "./openai-codex-auth.js";

const directories: string[] = [];

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graphchat-auth-"));
  directories.push(directory);
  const filePath = path.join(directory, "auth.json");
  return { filePath, store: new FileCredentialStore(filePath) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("FileCredentialStore", () => {
  it("persists OAuth credentials while list exposes metadata only", async () => {
    const { filePath, store } = setup();
    await store.modify("openai-codex", async () => ({
      type: "oauth",
      access: "access-secret",
      refresh: "refresh-secret",
      expires: Date.now() + 60_000,
      accountId: "account-test",
    }));

    expect(await store.list()).toEqual([
      { providerId: "openai-codex", type: "oauth" },
    ]);
    expect((await store.read("openai-codex"))?.type).toBe("oauth");
    expect(fs.readFileSync(filePath, "utf8")).toContain("refresh-secret");

    const restored = new FileCredentialStore(filePath);
    expect((await restored.read("openai-codex"))?.type).toBe("oauth");
  });

  it("lets the auth manager detect and remove a saved ChatGPT login", async () => {
    const { store } = setup();
    await store.modify("openai-codex", async () => ({
      type: "oauth",
      access: "test-access-token",
      refresh: "test-refresh-token",
      expires: Date.now() + 60_000,
      accountId: "account-test",
    }));
    const manager = new OpenAICodexAuthManager(store);

    await expect(manager.getStatus()).resolves.toMatchObject({
      state: "authenticated",
    });
    await expect(manager.logout()).resolves.toEqual({ state: "signed_out" });
    await expect(store.read("openai-codex")).resolves.toBeUndefined();
  });

  it("starts Pi's OpenAI device-code flow without exposing credentials", async () => {
    const { store } = setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/accounts/deviceauth/usercode")) {
        return new Response(
          JSON.stringify({
            device_auth_id: "device-test",
            user_code: "ABCD-EFGH",
            interval: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/accounts/deviceauth/token")) {
        return new Response("", { status: 403 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const manager = new OpenAICodexAuthManager(store);

    await expect(manager.start()).resolves.toMatchObject({
      state: "pending",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.openai.com/codex/device",
    });
    await manager.logout();
    expect(fetchMock).toHaveBeenCalled();
  });
});
