import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders GFM tables inside a keyboard-scrollable container", () => {
    const { container } = render(
      <Markdown>{`| Approach | Main goal | Tradeoff |
| --- | --- | --- |
| 2PC | Atomic commit across systems | Can block and be fragile |
| Sagas | Reliable process with undo steps | Compensation required |`}</Markdown>,
    );

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Approach" }),
    ).toBeVisible();
    expect(within(table).getByRole("cell", { name: "2PC" })).toBeVisible();
    const scroller = container.querySelector(".markdown-table-scroll");
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(scroller).toContainElement(table);
  });
});
