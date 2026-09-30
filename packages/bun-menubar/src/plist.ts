import type { MenubarConfig } from "./config.js";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Executable name inside Contents/MacOS: the product name without characters Finder dislikes. */
export function executableName(name: string) {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "");
  return safe || "MenuBarApp";
}

/** Info.plist for a menu-bar-only (LSUIElement) app. */
export function renderInfoPlist(config: MenubarConfig, options: { hasIcon: boolean }) {
  const entries: Array<[string, string]> = [
    ["CFBundleName", `<string>${escapeXml(config.name)}</string>`],
    ["CFBundleDisplayName", `<string>${escapeXml(config.name)}</string>`],
    ["CFBundleIdentifier", `<string>${escapeXml(config.bundleId)}</string>`],
    ["CFBundleExecutable", `<string>${escapeXml(executableName(config.name))}</string>`],
    ["CFBundlePackageType", "<string>APPL</string>"],
    ["CFBundleShortVersionString", `<string>${escapeXml(config.version)}</string>`],
    ["CFBundleVersion", `<string>${escapeXml(config.version)}</string>`],
    ["CFBundleInfoDictionaryVersion", "<string>6.0</string>"],
    ["LSMinimumSystemVersion", `<string>${escapeXml(config.minimumSystemVersion)}</string>`],
    // Menu bar only: no Dock icon, no Cmd-Tab entry.
    ["LSUIElement", "<true/>"],
    ["NSHighResolutionCapable", "<true/>"],
    ["NSSupportsAutomaticGraphicsSwitching", "<true/>"],
  ];
  if (options.hasIcon) entries.push(["CFBundleIconFile", "<string>AppIcon</string>"]);
  const body = entries.map(([key, value]) => `\t<key>${key}</key>\n\t${value}`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}
