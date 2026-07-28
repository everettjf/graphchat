const TRAILING_MAIN_THREAD_SECTION =
  /(?:^|\n)\s*(?:(?:#{1,6})\s+|>\s*\*{0,2}|\*{2})(?:Back\s+to\s+the\s+main\s+thread|带回主线)\s*:?\*{0,2}\s*:?\s*(?:[^\n]*)(?:\n[\s\S]*)?$/i;

/**
 * Older prompts asked the model to repeat the summary inside the answer body.
 * The inspector now owns that presentation, so hide the legacy/model-generated
 * trailing section and keep the dedicated summary card as the single source.
 */
export function stripTrailingMainThreadSection(content: string): string {
  return content.replace(TRAILING_MAIN_THREAD_SECTION, "").trimEnd();
}
