import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve("docs");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "app.js"), "utf8");
const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
const chineseReadme = fs.readFileSync(path.resolve("README.zh-CN.md"), "utf8");
const errors = [];

for (const required of [
  '<html lang="en">',
  "<title>",
  'name="description"',
  'property="og:title"',
  'property="og:image"',
  'id="main"',
  'data-language="en"',
  'data-language="zh"',
  'data-language="es"',
  'data-language="fr"',
  'data-language="de"',
  'data-language="ja"',
  'data-language="ko"',
  'data-language="zh-TW"',
]) {
  if (!html.includes(required)) errors.push(`Missing required markup: ${required}`);
}

if (html.includes('data-language="hi"') || /\bHindi\b|हिन्दी|印地语/.test(html + script)) {
  errors.push("Hindi must not remain in the documentation language switcher");
}

if (!readme.includes("## Quick start") || !readme.includes("./README.zh-CN.md")) {
  errors.push("README.md must be the English default and link to README.zh-CN.md");
}
if (!chineseReadme.includes("## 快速开始") || !chineseReadme.includes("./README.md")) {
  errors.push("README.zh-CN.md must contain Chinese content and link back to README.md");
}

const translatedAttributes = [
  ...html.matchAll(/\bdata-i18n(?:-content|-aria|-href)?="([^"]+)"/g),
  ...html.matchAll(/\bdata-(?:copy|copied)-label="([^"]+)"/g),
].map((match) => match[1]);
const chineseKeys = new Set(
  [...script.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]),
);
for (const key of new Set(translatedAttributes)) {
  if (!chineseKeys.has(key)) errors.push(`Missing Chinese translation: ${key}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
for (const id of new Set(ids)) {
  if (ids.filter((candidate) => candidate === id).length > 1) {
    errors.push(`Duplicate id: ${id}`);
  }
}

for (const match of html.matchAll(/(?:^|\s)(?:href|src)="([^"]+)"/gm)) {
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
