function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Shell command that resumes a Pi session in its working directory. */
export function buildOpenInTerminalCommand(cwd: string, sessionPath: string) {
  return `cd ${shellQuote(cwd)} && pi --session ${shellQuote(sessionPath)}`;
}
