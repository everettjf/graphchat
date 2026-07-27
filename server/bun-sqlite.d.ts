declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string);
    close(): void;
    exec(sql: string): unknown;
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
    };
  }
}
