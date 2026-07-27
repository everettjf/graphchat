import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

const execFileAsync = promisify(execFile);
const internetSettings =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

async function registryValue(name: string) {
  const { stdout } = await execFileAsync("reg.exe", [
    "query",
    internetSettings,
    "/v",
    name,
  ]);
  return stdout.trim().split(/\s{2,}/).at(-1)?.trim() || "";
}

function normalizeProxy(value: string) {
  const entries = Object.fromEntries(
    value.split(";").map((entry) => {
      const [key, proxy] = entry.split("=", 2);
      return proxy ? [key.toLowerCase(), proxy] : ["http", key];
    }),
  );
  const proxy = entries.https || entries.http;
  if (!proxy) return "";
  return /^[a-z]+:\/\//i.test(proxy) ? proxy : `http://${proxy}`;
}

export async function configureSystemProxy() {
  if (process.env.NODE_ENV === "test") return false;
  let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
  if (!proxy && process.platform === "win32") {
    try {
      const enabled = await registryValue("ProxyEnable");
      if (!/0x1$/i.test(enabled)) return false;
      proxy = normalizeProxy(await registryValue("ProxyServer"));
    } catch {
      return false;
    }
  }
  if (!proxy) return false;
  process.env.HTTPS_PROXY ||= proxy;
  process.env.HTTP_PROXY ||= proxy;
  process.env.NO_PROXY ||= "127.0.0.1,localhost,::1";
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return true;
}
