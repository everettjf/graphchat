// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("pi-graph-chat-extension package", () => {
  it("is discovered by Pi's resource loader with its extension, skills, and prompts", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-graph-chat-extension-agent-"));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-graph-chat-extension-cwd-"));
    directories.push(agentDir, cwd);
    const settingsManager = SettingsManager.inMemory({ packages: [packageDir] });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
    await loader.reload();

    const { extensions, errors } = loader.getExtensions();
    expect(errors).toEqual([]);
    expect(extensions.map((extension) => path.basename(extension.path))).toEqual(["pi-graph-chat.ts"]);

    const skills = loader.getSkills().skills.map((skill) => skill.name).sort();
    expect(skills).toEqual(["explain-back", "graph-compare", "graph-synthesize", "study-cards"]);

    const prompts = loader.getPrompts().prompts.map((prompt) => prompt.name).sort();
    expect(prompts).toEqual(["branch", "synthesize"]);
  });
});
