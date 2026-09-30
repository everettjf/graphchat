import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { MenubarConfig } from "./config.js";

export type Logger = (message: string) => void;

/** Entitlements a `bun build --compile` binary needs under the hardened runtime (JIT). */
export const BUN_ENTITLEMENTS = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-executable-page-protection",
  "com.apple.security.cs.allow-dyld-environment-variables",
  "com.apple.security.cs.disable-library-validation",
] as const;

export function renderEntitlements(keys: readonly string[]) {
  const body = keys.map((key) => `\t<key>${key}</key>\n\t<true/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

export type SigningPlan = {
  identity: string;
  adHoc: boolean;
  hardenedRuntime: boolean;
  /** Absolute path, or null to write the default Bun entitlements. */
  entitlements: string | null;
};

/** Merge config with the environment; `MENUBAR_SIGN_IDENTITY` wins so CI can inject a certificate. */
export function resolveSigning(
  config: MenubarConfig,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: { identity?: string } = {},
): SigningPlan {
  const identity = overrides.identity || env.MENUBAR_SIGN_IDENTITY || config.sign.identity;
  const adHoc = identity === "-";
  return {
    identity,
    adHoc,
    hardenedRuntime: config.sign.hardenedRuntime ?? !adHoc,
    entitlements: config.sign.entitlements ? path.resolve(root, config.sign.entitlements) : null,
  };
}

/** Arguments for one codesign invocation. Timestamps need a real identity. */
export function codesignArgs(plan: SigningPlan, target: string, entitlements: string | null) {
  const args = ["--force", "--sign", plan.identity];
  if (plan.hardenedRuntime) args.push("--options", "runtime");
  if (!plan.adHoc) args.push("--timestamp");
  if (entitlements) args.push("--entitlements", entitlements);
  args.push(target);
  return args;
}

/**
 * Sign inside-out, the way Apple asks: the server binary first, then the
 * bundle (which covers the shell executable and seals the resources).
 * `--deep` is deliberately not used.
 */
export function signApp(config: MenubarConfig, bundle: string, plan: SigningPlan, log: Logger = () => {}) {
  const contents = path.join(bundle, "Contents");
  const entitlements = plan.entitlements ?? path.join(contents, "..", "..", ".work", "entitlements.plist");
  if (!plan.entitlements) {
    fs.mkdirSync(path.dirname(entitlements), { recursive: true });
    fs.writeFileSync(entitlements, renderEntitlements(BUN_ENTITLEMENTS));
  }
  log(plan.adHoc ? "Signing ad hoc…" : `Signing with ${plan.identity}${plan.hardenedRuntime ? " (hardened runtime)" : ""}…`);
  const server = path.join(contents, "MacOS", "server");
  execFileSync("codesign", codesignArgs(plan, server, entitlements), { stdio: "inherit" });
  execFileSync("codesign", codesignArgs(plan, bundle, null), { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--strict", "--deep", bundle], { stdio: "inherit" });
}

export type NotaryPlan =
  | { kind: "profile"; profile: string; staple: boolean }
  | { kind: "apple-id"; appleId: string; teamId: string; password: string; staple: boolean }
  | null;

/**
 * Credentials for notarytool. The password is only ever read from the
 * environment so it cannot end up in a config file or a repository.
 */
export function resolveNotarization(config: MenubarConfig, env: NodeJS.ProcessEnv = process.env): NotaryPlan {
  const notarize = config.notarize;
  const profile = env.MENUBAR_NOTARY_PROFILE || notarize?.keychainProfile;
  if (!notarize && !profile) return null;
  const staple = notarize?.staple ?? true;
  if (profile) return { kind: "profile", profile, staple };
  if (notarize?.appleId && notarize.teamId) {
    const password = env.MENUBAR_NOTARY_PASSWORD;
    if (!password) {
      throw new Error("notarize.appleId is set but MENUBAR_NOTARY_PASSWORD is not in the environment.");
    }
    return { kind: "apple-id", appleId: notarize.appleId, teamId: notarize.teamId, password, staple };
  }
  throw new Error("notarize needs either keychainProfile or appleId + teamId.");
}

/** `xcrun notarytool submit` arguments; the password is passed via `@env:` so it never appears in argv. */
export function notarytoolArgs(plan: Exclude<NotaryPlan, null>, archive: string) {
  const args = ["notarytool", "submit", archive, "--wait", "--output-format", "json"];
  if (plan.kind === "profile") args.push("--keychain-profile", plan.profile);
  else args.push("--apple-id", plan.appleId, "--team-id", plan.teamId, "--password", "@env:MENUBAR_NOTARY_PASSWORD");
  return args;
}

export function notarizeApp(bundle: string, archive: string, plan: Exclude<NotaryPlan, null>, log: Logger = () => {}) {
  log("Submitting to Apple for notarization (this can take a few minutes)…");
  const output = execFileSync("xcrun", notarytoolArgs(plan, archive), {
    encoding: "utf8",
    env: plan.kind === "apple-id" ? { ...process.env, MENUBAR_NOTARY_PASSWORD: plan.password } : process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let result: { id?: string; status?: string } = {};
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error(`Could not read notarytool output:\n${output}`);
  }
  if (result.status !== "Accepted") {
    const hint = result.id ? `\nSee: xcrun notarytool log ${result.id}${plan.kind === "profile" ? ` --keychain-profile ${plan.profile}` : ""}` : "";
    throw new Error(`Notarization ${result.status ?? "failed"}.${hint}`);
  }
  log(`Notarized (submission ${result.id}).`);
  if (plan.staple) {
    log("Stapling the ticket…");
    execFileSync("xcrun", ["stapler", "staple", bundle], { stdio: "inherit" });
  }
}
