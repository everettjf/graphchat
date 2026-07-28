// @vitest-environment node
import { describe, expect, it } from "vitest";
import { stripTrailingMainThreadSection } from "../shared/answer-content.js";

describe("stripTrailingMainThreadSection", () => {
  it("removes a trailing English heading and its body", () => {
    expect(
      stripTrailingMainThreadSection(
        "Useful explanation.\n\n## Back to the main thread\n\nA repeated summary.",
      ),
    ).toBe("Useful explanation.");
  });

  it("removes legacy English and Chinese blockquotes", () => {
    expect(
      stripTrailingMainThreadSection(
        "Useful explanation.\n\n> **Back to the main thread:** A repeated summary.",
      ),
    ).toBe("Useful explanation.");
    expect(
      stripTrailingMainThreadSection(
        "有用的解释。\n\n> **带回主线：** 重复的摘要。",
      ),
    ).toBe("有用的解释。");
  });

  it("removes a trailing bold-only label", () => {
    expect(
      stripTrailingMainThreadSection(
        "Useful explanation.\n\n**Back to the main thread:** A repeated summary.",
      ),
    ).toBe("Useful explanation.");
  });

  it("does not remove an inline reference to the UI label", () => {
    const content =
      'The "Back to the main thread" card appears below this answer.';
    expect(stripTrailingMainThreadSection(content)).toBe(content);
  });
});
