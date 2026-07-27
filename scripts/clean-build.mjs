import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["dist", "dist-server"]) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) {
    throw new Error(`Refusing to clean unexpected path: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}
