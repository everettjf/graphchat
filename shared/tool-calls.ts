/** Stored arguments and results are summaries: long values are cut at these lengths. */
export const TOOL_CALL_ARGUMENTS_LIMIT = 2_000;
export const TOOL_CALL_RESULT_LIMIT = 4_000;

export function clipToolText(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
