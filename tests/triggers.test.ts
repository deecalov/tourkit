import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindTriggers } from "../src/tour/triggers";

describe("bindTriggers", () => {
  let unbind: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    unbind?.();
    unbind = null;
    document.querySelectorAll(".tk-root").forEach((el) => el.remove());
  });

  const addStep = (content: string, group?: string) => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", content);
    if (group) el.setAttribute("data-tour-group", group);
    document.body.append(el);
  };

  const addTrigger = (group = "") => {
    const btn = document.createElement("button");
    btn.setAttribute("data-tour-trigger", group);
    document.body.append(btn);
    return btn;
  };

  it("starts a tour from scanned data attributes on trigger click", async () => {
    addStep("step content");
    const trigger = addTrigger();
    unbind = bindTriggers();

    trigger.click();

    await vi.waitFor(() => expect(document.querySelector(".tk-root")).not.toBeNull());
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("step content");
  });

  it("filters steps by the trigger's group value", async () => {
    addStep("billing step", "billing");
    addStep("other step", "onboarding");
    const trigger = addTrigger("billing");
    unbind = bindTriggers();

    trigger.click();

    await vi.waitFor(() => expect(document.querySelector(".tk-root")).not.toBeNull());
    expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("billing step");
  });

  it("works with delegation for triggers added after binding", async () => {
    addStep("late");
    unbind = bindTriggers();

    const late = addTrigger(); // appended after bindTriggers()
    late.click();

    await vi.waitFor(() => expect(document.querySelector(".tk-root")).not.toBeNull());
  });

  it("unbind stops handling clicks", async () => {
    addStep("s");
    const trigger = addTrigger();
    unbind = bindTriggers();
    unbind();
    unbind = null;

    trigger.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector(".tk-root")).toBeNull();
  });

  it("restarts instead of stacking a second tour on a rapid double click", async () => {
    addStep("step content");
    const trigger = addTrigger();
    unbind = bindTriggers();

    trigger.click();
    trigger.click();

    // Let the queued exit → restart chain settle (exit fade is 200 ms).
    await vi.waitFor(
      () => {
        expect(document.querySelectorAll(".tk-root")).toHaveLength(1);
        expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("step content");
      },
      { timeout: 2000 }
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelectorAll(".tk-root")).toHaveLength(1);
  });

  it("switching triggers exits the previous tour before starting the new one", async () => {
    addStep("billing step", "billing");
    addStep("onboarding step", "onboarding");
    const first = addTrigger("billing");
    const second = addTrigger("onboarding");
    unbind = bindTriggers();

    first.click();
    await vi.waitFor(() =>
      expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("billing step")
    );

    second.click();
    await vi.waitFor(
      () =>
        expect(document.querySelector(".tk-tooltip__content")?.textContent).toBe("onboarding step"),
      { timeout: 2000 }
    );
    expect(document.querySelectorAll(".tk-root")).toHaveLength(1);
  });
});
