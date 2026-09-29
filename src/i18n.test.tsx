import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="language-label">{t("language.label")}</span>
      <span>{t("sidebar.newStart")}</span>
      <span>{t("sidebar.archivedThreads")}</span>
      <span>{t("graph.layout")}</span>
      <button onClick={() => setLocale("zh")}>switch</button>
    </div>
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  document.documentElement.lang = "en";
});

describe("I18nProvider", () => {
  it("defaults to English while retaining internal locale support", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByText("New thread")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(window.localStorage.getItem("pi-graph-chat-language")).toBe("zh");
    expect(screen.getByText("已归档对话")).toBeVisible();
    expect(screen.getByText("自动布局")).toBeVisible();
    expect(window.location.search).toBe("?lang=zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("honors a supported language in the URL", () => {
    window.history.replaceState(null, "", "/?lang=zh");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByText("新建学习起点")).toBeVisible();
  });

  it("falls back to English for the removed Hindi locale", () => {
    window.history.replaceState(null, "", "/?lang=hi");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByText("New thread")).toBeVisible();
  });
});
