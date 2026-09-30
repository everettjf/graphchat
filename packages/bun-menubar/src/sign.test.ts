// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import {
  BUN_ENTITLEMENTS,
  codesignArgs,
  notarytoolArgs,
  renderEntitlements,
  resolveNotarization,
  resolveSigning,
} from "./sign.js";

const base = { name: "Demo", bundleId: "dev.example.demo", entry: "server.js" };

describe("resolveSigning", () => {
  it("signs ad hoc without the hardened runtime by default", () => {
    const plan = resolveSigning(parseConfig(base), "/root", {});
    expect(plan).toEqual({ identity: "-", adHoc: true, hardenedRuntime: false, entitlements: null });
    expect(codesignArgs(plan, "/App.app", null)).toEqual(["--force", "--sign", "-", "/App.app"]);
  });

  it("turns on the hardened runtime and timestamps for a real identity", () => {
    const config = parseConfig({ ...base, sign: { identity: "Developer ID Application: X (TEAM)", entitlements: "ent.plist" } });
    const plan = resolveSigning(config, "/root", {});
    expect(plan).toEqual({
      identity: "Developer ID Application: X (TEAM)",
      adHoc: false,
      hardenedRuntime: true,
      entitlements: "/root/ent.plist",
    });
    expect(codesignArgs(plan, "/App.app/Contents/MacOS/server", "/root/ent.plist")).toEqual([
      "--force", "--sign", "Developer ID Application: X (TEAM)", "--options", "runtime", "--timestamp",
      "--entitlements", "/root/ent.plist", "/App.app/Contents/MacOS/server",
    ]);
  });

  it("lets the environment and the CLI override the identity", () => {
    const config = parseConfig({ ...base, sign: { identity: "From Config", hardenedRuntime: false } });
    expect(resolveSigning(config, "/r", { MENUBAR_SIGN_IDENTITY: "From Env" }).identity).toBe("From Env");
    expect(resolveSigning(config, "/r", { MENUBAR_SIGN_IDENTITY: "From Env" }, { identity: "From CLI" }).identity).toBe("From CLI");
    expect(resolveSigning(config, "/r", {}).hardenedRuntime).toBe(false);
  });

  it("writes the entitlements Bun's JIT needs", () => {
    const plist = renderEntitlements(BUN_ENTITLEMENTS);
    for (const key of BUN_ENTITLEMENTS) expect(plist).toContain(`<key>${key}</key>\n\t<true/>`);
  });
});

describe("resolveNotarization", () => {
  it("is off unless configured", () => {
    expect(resolveNotarization(parseConfig(base), {})).toBeNull();
  });

  it("prefers a keychain profile and never puts the password in argv", () => {
    const profile = resolveNotarization(parseConfig({ ...base, notarize: { keychainProfile: "notary" } }), {});
    expect(profile).toEqual({ kind: "profile", profile: "notary", staple: true });
    expect(notarytoolArgs(profile!, "/App.zip")).toEqual([
      "notarytool", "submit", "/App.zip", "--wait", "--output-format", "json", "--keychain-profile", "notary",
    ]);
    expect(resolveNotarization(parseConfig(base), { MENUBAR_NOTARY_PROFILE: "ci" })).toMatchObject({ profile: "ci" });

    const config = parseConfig({ ...base, notarize: { appleId: "me@example.com", teamId: "TEAM", staple: false } });
    expect(() => resolveNotarization(config, {})).toThrow(/MENUBAR_NOTARY_PASSWORD/);
    const appleId = resolveNotarization(config, { MENUBAR_NOTARY_PASSWORD: "app-specific" });
    expect(appleId).toEqual({ kind: "apple-id", appleId: "me@example.com", teamId: "TEAM", password: "app-specific", staple: false });
    const args = notarytoolArgs(appleId!, "/App.zip");
    expect(args).toContain("@env:MENUBAR_NOTARY_PASSWORD");
    expect(args.join(" ")).not.toContain("app-specific");
  });

  it("rejects a notarize block with neither a profile nor an Apple ID", () => {
    expect(() => resolveNotarization(parseConfig({ ...base, notarize: { staple: true } }), {})).toThrow(/keychainProfile/);
  });
});
