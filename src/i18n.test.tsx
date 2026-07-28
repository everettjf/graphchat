import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
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
    expect(window.localStorage.getItem("graphchat-language")).toBe("zh");
    expect(screen.getByText("已归档对话")).toBeVisible();
    expect(screen.getByText("自动布局")).toBeVisible();
    expect(window.location.search).toBe("?lang=zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("keeps the product in English on first render", () => {
    window.history.replaceState(null, "", "/?lang=zh");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByText("New thread")).toBeVisible();
  });
});
