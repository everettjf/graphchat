import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve("docs");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const errors = [];

for (const required of [
  "<title>",
  'name="description"',
  'property="og:title"',
  'property="og:image"',
  'id="main"',
]) {
  if (!html.includes(required)) errors.push(`Missing required markup: ${required}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
for (const id of new Set(ids)) {
  if (ids.filter((candidate) => candidate === id).length > 1) {
    errors.push(`Duplicate id: ${id}`);
  }
}

for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const target = match[1];
  if (target.startsWith("#")) {
    if (target !== "#" && !ids.includes(target.slice(1))) {
      errors.push(`Broken page anchor: ${target}`);
    }
    continue;
  }
  if (/^(https?:|mailto:)/.test(target)) continue;
  const clean = target.split(/[?#]/)[0];
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
    errors.push(`Missing local asset: ${target}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`GitHub Pages validation passed (${ids.length} sections, all local assets resolved).`);
