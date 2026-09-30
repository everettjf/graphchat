import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, type MenubarConfig } from "./config.js";
import { executableName, renderInfoPlist } from "./plist.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellPackage = path.join(packageRoot, "shell");

export type Logger = (message: string) => void;

function run(command: string, args: string[], options: { cwd?: string; quiet?: boolean } = {}) {
  execFileSync(command, args, { cwd: options.cwd, stdio: options.quiet ? ["ignore", "ignore", "inherit"] : "inherit" });
}

/** Locate the compiled Swift shell, building it with SwiftPM when it is missing. */
export function ensureShellBinary(log: Logger = () => {}): string {
  const prebuilt = path.join(packageRoot, "bin", "MenuBarShell");
  if (fs.existsSync(prebuilt)) return prebuilt;
  const built = path.join(shellPackage, ".build", "release", "MenuBarShell");
  if (!fs.existsSync(built)) {
    log("Building the native shell with swift build (first run only)…");
    run("swift", ["build", "-c", "release", "--package-path", shellPackage]);
  }
  return built;
}

/** `bun build --compile` the entry into a single Mach-O for this machine's architecture. */
export function compileServer(config: MenubarConfig, root: string, outFile: string, log: Logger = () => {}) {
  const target = process.arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64";
  log(`Compiling ${config.entry} for ${target}…`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  run(
    "bun",
    ["build", "--compile", `--target=${target}`, ...config.compileArgs, path.resolve(root, config.entry), "--outfile", outFile],
    { cwd: root },
  );
  return outFile;
}

/** Turn a square PNG into AppIcon.icns with the system tools. */
export function makeIcns(png: string, outFile: string) {
  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), "bun-menubar-icon-")) + ".iconset";
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    run("sips", ["-z", `${size}`, `${size}`, png, "--out", path.join(iconset, `icon_${size}x${size}.png`)], { quiet: true });
    run("sips", ["-z", `${size * 2}`, `${size * 2}`, png, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)], { quiet: true });
  }
  run("iconutil", ["-c", "icns", iconset, "-o", outFile]);
  fs.rmSync(iconset, { recursive: true, force: true });
}

export type AssembleOptions = {
  root: string;
  shellBinary: string;
  serverBinary: string;
  /** Skip sips/iconutil (tests). */
  skipIcns?: boolean;
  log?: Logger;
};

/** Lay out `<outDir>/<name>.app` from the pieces. Returns the bundle path. */
export function assembleApp(config: MenubarConfig, options: AssembleOptions): string {
  const log = options.log ?? (() => {});
  const bundle = path.resolve(options.root, config.outDir, `${config.name}.app`);
  const contents = path.join(bundle, "Contents");
  const macos = path.join(contents, "MacOS");
  const resources = path.join(contents, "Resources");
  fs.rmSync(bundle, { recursive: true, force: true });
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  fs.copyFileSync(options.shellBinary, path.join(macos, executableName(config.name)));
  fs.chmodSync(path.join(macos, executableName(config.name)), 0o755);
  fs.copyFileSync(options.serverBinary, path.join(resources, "server"));
  fs.chmodSync(path.join(resources, "server"), 0o755);

  for (const [published, source] of Object.entries(config.resources)) {
    const from = path.resolve(options.root, source);
    if (!fs.existsSync(from)) throw new Error(`Resource "${source}" does not exist.`);
    log(`Copying ${source} → Resources/${published}`);
    fs.cpSync(from, path.join(resources, published), { recursive: true });
  }

  let hasIcon = false;
  if (config.icon) {
    const icon = path.resolve(options.root, config.icon);
    if (!fs.existsSync(icon)) throw new Error(`App icon "${config.icon}" does not exist.`);
    if (options.skipIcns) fs.copyFileSync(icon, path.join(resources, "AppIcon.icns"));
    else makeIcns(icon, path.join(resources, "AppIcon.icns"));
    hasIcon = true;
  }
  if (config.menuBarIcon) {
    const icon = path.resolve(options.root, config.menuBarIcon);
    if (!fs.existsSync(icon)) throw new Error(`Menu bar icon "${config.menuBarIcon}" does not exist.`);
    fs.copyFileSync(icon, path.join(resources, "MenuBarIcon.png"));
  }

  fs.writeFileSync(path.join(resources, "menubar.json"), `${JSON.stringify(buildManifest(config), null, 2)}\n`);
  fs.writeFileSync(path.join(contents, "Info.plist"), renderInfoPlist(config, { hasIcon }));
  fs.writeFileSync(path.join(contents, "PkgInfo"), "APPL????");
  return bundle;
}

export function signApp(config: MenubarConfig, bundle: string, log: Logger = () => {}) {
  log(config.sign.identity === "-" ? "Signing ad hoc…" : `Signing with ${config.sign.identity}…`);
  run("codesign", ["--force", "--deep", "--sign", config.sign.identity, bundle]);
}

export function zipApp(bundle: string, log: Logger = () => {}) {
  const zip = bundle.replace(/\.app$/, ".zip");
  fs.rmSync(zip, { force: true });
  log(`Zipping → ${path.basename(zip)}`);
  run("ditto", ["-c", "-k", "--keepParent", bundle, zip]);
  return zip;
}

/** The whole pipeline: compile, build the shell if needed, assemble, sign, zip. */
export function buildApp(config: MenubarConfig, root: string, log: Logger = () => {}) {
  const work = path.resolve(root, config.outDir, ".work");
  fs.mkdirSync(work, { recursive: true });
  const serverBinary = compileServer(config, root, path.join(work, "server"), log);
  const shellBinary = ensureShellBinary(log);
  const bundle = assembleApp(config, { root, shellBinary, serverBinary, log });
  signApp(config, bundle, log);
  const zip = zipApp(bundle, log);
  fs.rmSync(work, { recursive: true, force: true });
  return { bundle, zip };
}
