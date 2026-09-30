import * as z from "zod";

const menuItemSchema = z.union([
  z.object({ type: z.literal("separator") }),
  z.object({
    label: z.string().min(1),
    /** Built-in actions, or omit and give a `url` to open. */
    action: z.enum(["open", "restart", "quit"]).optional(),
    url: z.string().url().optional(),
  }),
]);

/** `menubar.config.ts` — what `bun-menubar build` reads from the project root. */
export const menubarConfigSchema = z.object({
  /** Product name; also the .app name and the Application Support folder. */
  name: z.string().min(1).max(80),
  bundleId: z.string().regex(/^[A-Za-z0-9.-]+$/, "bundleId must look like com.example.app"),
  version: z.string().min(1).default("0.1.0"),
  /** Entry compiled with `bun build --compile`, relative to the project root. */
  entry: z.string().min(1),
  /** Extra flags for `bun build --compile`, e.g. ["--minify"]. */
  compileArgs: z.array(z.string()).default([]),
  outDir: z.string().min(1).default("dist-app"),
  /** 1024×1024 PNG for the app icon (Finder, alerts). Optional. */
  icon: z.string().optional(),
  /** Monochrome PNG (with alpha) shown in the menu bar as a template image; 18×18 points, supply @2x. */
  menuBarIcon: z.string().optional(),
  /** Files to copy into Contents/Resources: { "static": "dist" } publishes ./dist as Resources/static. */
  resources: z.record(z.string(), z.string()).default({}),
  server: z
    .object({
      args: z.array(z.string()).default([]),
      /** Values may use ${RESOURCES}, ${APP_SUPPORT}, ${LOGS}, ${HOME}. */
      env: z.record(z.string(), z.string()).default({}),
      cwd: z.string().default("${APP_SUPPORT}"),
    })
    .prefault({}),
  /** Polled until it answers 2xx; the menu shows the result. */
  healthUrl: z.string().url().optional(),
  /** What "Open" launches in the default browser. */
  openUrl: z.string().url().optional(),
  openOnLaunch: z.boolean().default(true),
  menu: z.array(menuItemSchema).optional(),
  /** Crash restarts before the shell gives up. */
  restartLimit: z.number().int().min(0).default(5),
  /** Minimum macOS version written to Info.plist. */
  minimumSystemVersion: z.string().default("12.0"),
  sign: z
    .object({
      /** Developer ID identity; ad-hoc ("-") when omitted. */
      identity: z.string().default("-"),
    })
    .prefault({}),
});

export type MenubarConfig = z.infer<typeof menubarConfigSchema>;
export type MenubarConfigInput = z.input<typeof menubarConfigSchema>;

/** Identity helper for `menubar.config.ts`. */
export function defineConfig(config: MenubarConfigInput): MenubarConfigInput {
  return config;
}

export function parseConfig(input: unknown): MenubarConfig {
  return menubarConfigSchema.parse(input);
}

/** The manifest the Swift shell reads at runtime (Contents/Resources/menubar.json). */
export function buildManifest(config: MenubarConfig) {
  return {
    name: config.name,
    server: {
      command: "server",
      args: config.server.args,
      env: config.server.env,
      cwd: config.server.cwd,
    },
    healthUrl: config.healthUrl ?? null,
    openUrl: config.openUrl ?? null,
    openOnLaunch: config.openOnLaunch,
    icon: config.menuBarIcon ? "MenuBarIcon.png" : null,
    menu: config.menu ?? null,
    restartLimit: config.restartLimit,
  };
}
