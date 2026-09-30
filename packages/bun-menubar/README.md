# bun-menubar

Wrap a Bun program as a macOS menu bar app. The program is compiled with
`bun build --compile` and bundled behind a small native shell (AppKit,
~200 KB) that runs it, watches its health, and shows a status item. No Dock
icon, no Electron.

```
My App.app/
├── Contents/MacOS/MyApp            the Swift shell
├── Contents/MacOS/server           your program, one Mach-O
├── Contents/Resources/menubar.json what the shell needs to know
├── Contents/Resources/static/      anything you listed under `resources`
└── Contents/Info.plist             LSUIElement = true
```

## Use

```bash
bun add -d bun-menubar
```

`menubar.config.ts` in the project root:

```ts
import { defineConfig } from "bun-menubar/src/config.js";

export default defineConfig({
  name: "My App",
  bundleId: "com.example.my-app",
  version: "1.0.0",
  entry: "dist/server.js",                 // compiled with bun build --compile
  icon: "assets/app-icon.png",             // 1024×1024, optional
  menuBarIcon: "assets/menubar-icon.png",  // monochrome template image, 36×36 (@2x), optional
  resources: { static: "dist/client" },    // copied to Contents/Resources/static
  server: {
    env: {
      PORT: "4000",
      CLIENT_DIR: "${RESOURCES}/static",
      DATA_DIR: "${APP_SUPPORT}",
    },
  },
  healthUrl: "http://127.0.0.1:4000/health",
  openUrl: "http://127.0.0.1:4000",
  menu: [{ label: "Open My App", action: "open" }],
});
```

```bash
bunx bun-menubar build      # → dist-app/My App.app and My App.zip
```

The first build compiles the shell with `swift build` (Xcode command line
tools required); later builds reuse it.

## What the shell does

- Starts `Contents/MacOS/server` with your `env`, `args`, and `cwd`. Values may use
  `${RESOURCES}`, `${APP_SUPPORT}` (`~/Library/Application Support/<name>`),
  `${LOGS}` (`~/Library/Logs/<name>`), and `${HOME}`. The same paths are also
  exported as `MENUBAR_RESOURCES`, `MENUBAR_APP_SUPPORT`, and `MENUBAR_LOGS`.
- Writes the program's stdout and stderr to `~/Library/Logs/<name>/server.log`.
- Polls `healthUrl` and shows *Starting… / Running / Exited* at the top of the
  menu; *Open* is enabled once the health check passes.
- Restarts the program when it exits unexpectedly, with exponential backoff,
  up to `restartLimit` times.
- Opens `openUrl` in the default browser on launch (`openOnLaunch`) and from
  the menu. Custom menu items can also carry a `url`.
- Adds *Show Logs*, *Restart Server*, and *Quit*; quitting terminates the
  program (SIGTERM, then SIGKILL after three seconds).
- Runs as a single instance and as an accessory app (no Dock icon).

## Signing and notarization

Builds are signed ad hoc by default, which runs on the machine that built it
(the server binary gets the entitlements Bun's JIT needs either way). For
distribution:

```ts
sign: {
  identity: "Developer ID Application: Your Name (TEAMID)", // or MENUBAR_SIGN_IDENTITY
  // hardenedRuntime: true,   default for a real identity; notarization requires it
  // entitlements: "…",       your own plist instead of the built-in Bun JIT set
},
notarize: {
  keychainProfile: "my-notary", // or MENUBAR_NOTARY_PROFILE
  // or: appleId + teamId, with the app-specific password in MENUBAR_NOTARY_PASSWORD
  staple: true,
},
```

Store the notarization credentials once, outside the repository:

```bash
xcrun notarytool store-credentials my-notary --apple-id you@example.com --team-id TEAMID
```

The build then signs inside-out (server binary, then the bundle; no `--deep`),
verifies the signature, zips, submits with `notarytool submit --wait`, staples
the ticket, and zips again. `bun-menubar build --skip-notarize` skips the
Apple round trip; `--identity` overrides the certificate for one build.
Passwords are only ever read from the environment and are handed to
`notarytool` as `@env:`, never on the command line.

## Layout

- `shell/` — SwiftPM package for the native shell (`swift build -c release`).
- `src/config.ts` — config schema and the runtime manifest.
- `src/build.ts` — compile, assemble, zip.
- `src/sign.ts` — codesign, entitlements, notarytool, stapler.
- `src/cli.ts` — `bun-menubar build`.

macOS only. Universal binaries, an embedded WKWebView window, and a stdio
channel for dynamic menus are planned.
