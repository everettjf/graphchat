import {
  createModels,
  type AuthEvent,
  type AuthPrompt,
  type CredentialStore,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { CodexAuthStatus } from "../shared/types.js";

const PROVIDER_ID = "openai-codex";

export class OpenAICodexAuthManager {
  private readonly models;
  private state: CodexAuthStatus | null = null;
  private controller: AbortController | null = null;
  private loginTask: Promise<void> | null = null;
  private attempt = 0;

  constructor(credentials: CredentialStore) {
    this.models = createModels({ credentials });
    this.models.setProvider(openaiCodexProvider());
  }

  async getStatus(): Promise<CodexAuthStatus> {
    if (this.state?.state === "starting" || this.state?.state === "pending") {
      return this.state;
    }
    try {
      const auth = await this.models.getAuth(PROVIDER_ID);
      this.state = auth
        ? { state: "authenticated", source: auth.source || "ChatGPT OAuth" }
        : { state: "signed_out" };
    } catch (error) {
      this.state = {
        state: "error",
        message: error instanceof Error ? error.message : "无法验证 ChatGPT 登录状态。",
      };
    }
    return this.state;
  }

  async start(): Promise<CodexAuthStatus> {
    if (this.loginTask) return this.state || { state: "starting" };
    const existing = await this.getStatus();
    if (existing.state === "authenticated") return existing;

    const attempt = ++this.attempt;
    const controller = new AbortController();
    this.controller = controller;
    this.state = { state: "starting" };

    let resolveReady: (status: CodexAuthStatus) => void = () => undefined;
    const ready = new Promise<CodexAuthStatus>((resolve) => {
      resolveReady = resolve;
    });

    const setState = (status: CodexAuthStatus) => {
      if (this.attempt !== attempt) return;
      this.state = status;
      resolveReady(status);
    };

    this.loginTask = this.models
      .login(PROVIDER_ID, "oauth", {
        signal: controller.signal,
        prompt: (prompt) => this.answerPrompt(prompt),
        notify: (event) => this.handleEvent(event, setState),
      })
      .then(() => {
        setState({ state: "authenticated", source: "ChatGPT OAuth" });
      })
      .catch((error) => {
        if (this.attempt !== attempt) return;
        setState({
          state: "error",
          message:
            controller.signal.aborted
              ? "登录已取消。"
              : error instanceof Error
                ? error.message
                : "ChatGPT 登录失败。",
        });
      })
      .finally(() => {
        if (this.attempt === attempt) {
          this.controller = null;
          this.loginTask = null;
        }
      });

    return Promise.race([
      ready,
      new Promise<CodexAuthStatus>((resolve) =>
        setTimeout(
          () =>
            resolve(
              this.state || {
                state: "error",
                message: "等待 OpenAI 设备码超时，请重试。",
              },
            ),
          15_000,
        ),
      ),
    ]);
  }

  async logout() {
    this.attempt += 1;
    this.controller?.abort();
    this.controller = null;
    this.loginTask = null;
    await this.models.logout(PROVIDER_ID);
    this.state = { state: "signed_out" };
    return this.state;
  }

  dispose() {
    this.attempt += 1;
    this.controller?.abort();
    this.controller = null;
  }

  private async answerPrompt(prompt: AuthPrompt): Promise<string> {
    if (prompt.type === "select") {
      const deviceCode = prompt.options.find((option) => option.id === "device_code");
      if (!deviceCode) throw new Error("当前 Pi 版本不支持 OpenAI 设备码登录。");
      return deviceCode.id;
    }
    throw new Error(`OpenAI Codex 登录要求了未支持的输入步骤：${prompt.type}`);
  }

  private handleEvent(
    event: AuthEvent,
    setState: (status: CodexAuthStatus) => void,
  ) {
    if (event.type === "device_code") {
      setState({
        state: "pending",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        expiresAt: new Date(
          Date.now() + (event.expiresInSeconds || 15 * 60) * 1_000,
        ).toISOString(),
        message: "在 OpenAI 页面输入验证码，完成后这里会自动连接。",
      });
    } else if (event.type === "progress") {
      if (this.state?.state === "pending") {
        this.state = { ...this.state, message: event.message };
      }
    }
  }
}
