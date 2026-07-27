import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span>{t("sidebar.newStart")}</span>
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
  it("defaults to English and persists a Chinese language switch", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByText("New learning thread")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByText("新建学习起点")).toBeVisible();
    expect(window.localStorage.getItem("graphchat-language")).toBe("zh");
    expect(window.location.search).toBe("?lang=zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("honors a shareable language query on first render", () => {
    window.history.replaceState(null, "", "/?lang=zh");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("zh");
    expect(screen.getByText("新建学习起点")).toBeVisible();
  });
});
