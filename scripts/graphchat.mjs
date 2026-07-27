#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
let packageVersion = "0.2.0";
try {
  packageVersion = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ).version;
} catch {
  // Standalone release executables intentionally do not carry package.json.
}
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Graph Chat ${packageVersion}

Usage:
  graphchat [options]

Options:
  --port <number>      Local port (default: 4317)
  --host <address>     Bind address (default: 127.0.0.1)
  --data-dir <path>    Graph Chat data directory
  --no-open            Do not open a browser automatically
  --version, -v        Print the version
  --help, -h           Show this help
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageVersion);
  process.exit(0);
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

const port = option("--port") || process.env.PORT || "4317";
const host = option("--host") || process.env.HOST || "127.0.0.1";
const dataDirectory = option("--data-dir");
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
  throw new Error("--port must be a number between 1 and 65535.");
}

const executableClient = path.join(path.dirname(process.execPath), "dist");
const packageClient = path.join(packageRoot, "dist");
const clientDirectory = fs.existsSync(path.join(executableClient, "index.html"))
  ? executableClient
  : packageClient;

if (!fs.existsSync(path.join(clientDirectory, "index.html"))) {
  throw new Error(
    "The production client is missing. Run `bun run build` before starting Graph Chat.",
  );
}

process.env.NODE_ENV = "production";
process.env.PORT = port;
process.env.HOST = host;
process.env.GRAPHCHAT_CLIENT_DIR = clientDirectory;
if (dataDirectory) process.env.GRAPHCHAT_DATA_DIR = path.resolve(dataDirectory);

await import("../dist-server/server/index.js");

const visibleHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
const url = `http://${visibleHost}:${port}`;
console.log(`\nGraph Chat is ready at ${url}`);

if (!args.includes("--no-open")) {
  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
