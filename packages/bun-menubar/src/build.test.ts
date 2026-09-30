// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assembleApp } from "./build.js";
import { buildManifest, parseConfig } from "./config.js";
import { executableName, renderInfoPlist } from "./plist.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bun-menubar-test-"));
  directories.push(directory);
  return directory;
}

const minimal = {
  name: "Demo App",
  bundleId: "dev.example.demo",
  entry: "server.js",
  healthUrl: "http://127.0.0.1:4000/health",
  openUrl: "http://127.0.0.1:4000",
};

describe("config", () => {
  it("fills defaults and validates the bundle id", () => {
    const config = parseConfig(minimal);
    expect(config).toMatchObject({
      version: "0.1.0",
      outDir: "dist-app",
      openOnLaunch: true,
      restartLimit: 5,
      server: { args: [], env: {}, cwd: "${APP_SUPPORT}" },
      sign: { identity: "-" },
    });
    expect(() => parseConfig({ ...minimal, bundleId: "not a bundle id" })).toThrow(/bundleId/);
    expect(() => parseConfig({ ...minimal, menu: [{ label: "" }] })).toThrow();
  });

  it("builds the runtime manifest the shell reads", () => {
    const config = parseConfig({
      ...minimal,
      menuBarIcon: "icon.png",
      server: { env: { PORT: "4000", DATA: "${APP_SUPPORT}/data" } },
      menu: [{ label: "Open", action: "open" }, { type: "separator" }, { label: "Docs", url: "https://example.com" }],
    });
    expect(buildManifest(config)).toEqual({
      name: "Demo App",
      server: { command: "server", args: [], env: { PORT: "4000", DATA: "${APP_SUPPORT}/data" }, cwd: "${APP_SUPPORT}" },
      healthUrl: "http://127.0.0.1:4000/health",
      openUrl: "http://127.0.0.1:4000",
      openOnLaunch: true,
      icon: "MenuBarIcon.png",
      menu: [{ label: "Open", action: "open" }, { type: "separator" }, { label: "Docs", url: "https://example.com" }],
      restartLimit: 5,
    });
  });
});

describe("Info.plist", () => {
  it("marks the app as a menu bar agent and escapes names", () => {
    const plist = renderInfoPlist(parseConfig({ ...minimal, name: "A & B <C>" }), { hasIcon: true });
    expect(plist).toContain("<key>LSUIElement</key>\n\t<true/>");
    expect(plist).toContain("<string>A &amp; B &lt;C&gt;</string>");
    expect(plist).toContain("<key>CFBundleExecutable</key>\n\t<string>ABC</string>");
    expect(plist).toContain("<key>CFBundleIconFile</key>\n\t<string>AppIcon</string>");
    expect(renderInfoPlist(parseConfig(minimal), { hasIcon: false })).not.toContain("CFBundleIconFile");
    expect(executableName("   ")).toBe("MenuBarApp");
  });
});

describe("assembleApp", () => {
  it("lays out the bundle with the shell, the server, resources, and the manifest", () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "index.html"), "<h1>hi</h1>");
    fs.writeFileSync(path.join(root, "shell-bin"), "#!/bin/sh\necho shell\n");
    fs.writeFileSync(path.join(root, "server-bin"), "#!/bin/sh\necho server\n");
    fs.writeFileSync(path.join(root, "menubar.png"), "png");
    fs.writeFileSync(path.join(root, "icon.png"), "png");
    const config = parseConfig({
      ...minimal,
      icon: "icon.png",
      menuBarIcon: "menubar.png",
      resources: { static: "dist" },
    });

    const bundle = assembleApp(config, {
      root,
      shellBinary: path.join(root, "shell-bin"),
      serverBinary: path.join(root, "server-bin"),
      skipIcns: true,
    });

    expect(bundle).toBe(path.join(root, "dist-app", "Demo App.app"));
    const contents = path.join(bundle, "Contents");
    expect(fs.readFileSync(path.join(contents, "MacOS", "DemoApp"), "utf8")).toContain("echo shell");
    expect(fs.statSync(path.join(contents, "MacOS", "DemoApp")).mode & 0o111).toBeTruthy();
    expect(fs.readFileSync(path.join(contents, "MacOS", "server"), "utf8")).toContain("echo server");
    expect(fs.existsSync(path.join(contents, "Resources", "server"))).toBe(false);
    expect(fs.readFileSync(path.join(contents, "Resources", "static", "index.html"), "utf8")).toBe("<h1>hi</h1>");
    expect(fs.existsSync(path.join(contents, "Resources", "MenuBarIcon.png"))).toBe(true);
    expect(fs.existsSync(path.join(contents, "Resources", "AppIcon.icns"))).toBe(true);
    expect(fs.readFileSync(path.join(contents, "PkgInfo"), "utf8")).toBe("APPL????");
    const manifest = JSON.parse(fs.readFileSync(path.join(contents, "Resources", "menubar.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Demo App", icon: "MenuBarIcon.png", server: { command: "server" } });
    expect(fs.readFileSync(path.join(contents, "Info.plist"), "utf8")).toContain("dev.example.demo");
  });

  it("refuses missing resources and replaces a previous bundle", () => {
    const root = temporaryRoot();
    fs.writeFileSync(path.join(root, "bin"), "x");
    const config = parseConfig({ ...minimal, resources: { static: "missing" } });
    expect(() =>
      assembleApp(config, { root, shellBinary: path.join(root, "bin"), serverBinary: path.join(root, "bin") }),
    ).toThrow(/does not exist/);

    const stale = path.join(root, "dist-app", "Demo App.app", "Contents", "Resources", "old.txt");
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, "old");
    assembleApp(parseConfig(minimal), { root, shellBinary: path.join(root, "bin"), serverBinary: path.join(root, "bin") });
    expect(fs.existsSync(stale)).toBe(false);
  });
});
