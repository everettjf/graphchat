#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildApp } from "./build.js";
import { parseConfig } from "./config.js";

const usage = `bun-menubar — wrap a Bun program as a macOS menu bar app

Usage:
  bun-menubar build [--config <file>] [--root <dir>] [--identity <name>] [--skip-notarize]

Reads menubar.config.ts (or .js/.json) from the project root, compiles the
entry with \`bun build --compile\`, and writes <outDir>/<name>.app plus a zip.

Signing:   sign.identity or MENUBAR_SIGN_IDENTITY (ad hoc when unset)
Notarizing: notarize.keychainProfile or MENUBAR_NOTARY_PROFILE, or
            notarize.appleId + teamId with MENUBAR_NOTARY_PASSWORD in the environment
`;

async function loadConfig(root: string, explicit?: string) {
  const candidates = explicit
    ? [path.resolve(root, explicit)]
    : ["menubar.config.ts", "menubar.config.js", "menubar.config.mjs", "menubar.config.json"].map((name) =>
        path.join(root, name),
      );
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error(`No menubar.config.{ts,js,mjs,json} found in ${root}.`);
  if (file.endsWith(".json")) return parseConfig(JSON.parse(fs.readFileSync(file, "utf8")));
  const module = (await import(pathToFileURL(file).href)) as { default?: unknown };
  return parseConfig(module.default);
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

async function main(argv: string[]) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command !== "build") throw new Error(`Unknown command "${command}".\n\n${usage}`);
  if (process.platform !== "darwin") throw new Error("bun-menubar builds macOS apps and must run on macOS.");
  const root = path.resolve(option(args, "--root") ?? process.cwd());
  const config = await loadConfig(root, option(args, "--config"));
  const { bundle, zip } = buildApp(config, root, (message) => console.log(`• ${message}`), {
    identity: option(args, "--identity"),
    skipNotarize: args.includes("--skip-notarize"),
  });
  console.log(`\n${config.name}.app is ready:\n  ${bundle}\n  ${zip}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
