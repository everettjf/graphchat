import fs from "node:fs";

function readJson(filename, allowTrailingCommas = false) {
  const source = fs.readFileSync(filename, "utf8");
  return JSON.parse(
    allowTrailingCommas ? source.replace(/,\s*([}\]])/g, "$1") : source,
  );
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const bunLock = readJson("bun.lock", true);
const versionSource = fs.readFileSync("shared/version.ts", "utf8");
const appVersion = versionSource.match(/APP_VERSION = "([^"]+)"/)?.[1];
const failures = [];

if (packageLock.version !== packageJson.version) {
  failures.push("package-lock.json top-level version differs from package.json");
}
if (packageLock.packages?.[""]?.version !== packageJson.version) {
  failures.push("package-lock.json workspace version differs from package.json");
}
if (appVersion !== packageJson.version) {
  failures.push("shared/version.ts APP_VERSION differs from package.json");
}

for (const section of ["dependencies", "devDependencies"]) {
  const expected = packageJson[section] || {};
  const npmValues = packageLock.packages?.[""]?.[section] || {};
  const bunValues = bunLock.workspaces?.[""]?.[section] || {};
  for (const [name, range] of Object.entries(expected)) {
    if (npmValues[name] !== range) {
      failures.push(`package-lock.json ${section}.${name} is out of sync`);
    }
    if (bunValues[name] !== range) {
      failures.push(`bun.lock ${section}.${name} is out of sync`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Release metadata is consistent for Graph Chat ${packageJson.version}.`);
