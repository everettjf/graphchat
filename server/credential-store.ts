import fs from "node:fs/promises";
import path from "node:path";
import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

type CredentialFile = {
  version: 1;
  credentials: Record<string, Credential>;
};

function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "api_key") {
    return candidate.key === undefined || typeof candidate.key === "string";
  }
  return (
    candidate.type === "oauth" &&
    typeof candidate.access === "string" &&
    typeof candidate.refresh === "string" &&
    typeof candidate.expires === "number"
  );
}

/**
 * Minimal file-backed Pi credential store.
 *
 * Graph Chat uses it only for OAuth credentials. Writes are serialized and
 * atomic; the file is created with owner-only permissions on platforms that
 * support POSIX modes. Secrets never leave this class through list().
 */
export class FileCredentialStore implements CredentialStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(providerId: string): Promise<Credential | undefined> {
    return (await this.readAll()).credentials[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const { credentials } = await this.readAll();
    return Object.entries(credentials).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      const data = await this.readAll();
      const current = data.credentials[providerId];
      const next = await fn(current);
      if (next !== undefined) {
        data.credentials[providerId] = next;
        await this.writeAll(data);
        return next;
      }
      return current;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.enqueue(async () => {
      const data = await this.readAll();
      if (!(providerId in data.credentials)) return;
      delete data.credentials[providerId];
      await this.writeAll(data);
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async readAll(): Promise<CredentialFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CredentialFile>;
      const credentials: Record<string, Credential> = {};
      if (parsed.version === 1 && parsed.credentials && typeof parsed.credentials === "object") {
        for (const [providerId, credential] of Object.entries(parsed.credentials)) {
          if (isCredential(credential)) credentials[providerId] = credential;
        }
      }
      return { version: 1, credentials };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, credentials: {} };
      }
      throw error;
    }
  }

  private async writeAll(data: CredentialFile) {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, this.filePath);
    await fs.chmod(this.filePath, 0o600).catch(() => undefined);
  }
}
