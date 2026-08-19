import { describe, expect, it } from "vitest";
import { createTextDragController, type TextDragPointerEvent } from "../shared/textDragController";

function createHarness() {
  const updates: Array<{ id: string; x: number; y: number }> = [];
  const selected: string[] = [];
  const dragStates: Array<string | null> = [];
  const captures: number[] = [];
  const releases: number[] = [];
  const target = {
    setPointerCapture: (id: number) => captures.push(id),
    hasPointerCapture: (id: number) => captures.includes(id),
    releasePointerCapture: (id: number) => releases.push(id),
  };
  const event = (clientX: number, clientY: number, pointerId = 1): TextDragPointerEvent => ({
    pointerId, clientX, clientY, currentTarget: target, preventDefault: () => undefined, stopPropagation: () => undefined,
  });
  const controller = createTextDragController({
    getBounds: () => ({ left: 100, top: 100, width: 400, height: 200 }),
    selectText: id => selected.push(id),
    setDraggingText: id => dragStates.push(id),
    updatePosition: (id, position) => updates.push({ id, ...position }),
  });
  return { controller, event, updates, selected, dragStates, captures, releases };
}

describe("text drag controller", () => {
  it("captures the pointer, updates the selected layer during a mouse drag, and releases it", () => {
    const test = createHarness();
    test.controller.begin(test.event(200, 150), "title");
    expect(test.captures).toEqual([1]);
    expect(test.selected).toEqual(["title"]);
    expect(test.updates.at(-1)).toEqual({ id: "title", x: 25, y: 25 });

    expect(test.controller.move(test.event(500, 300), "title")).toBe(true);
    expect(test.updates.at(-1)).toEqual({ id: "title", x: 100, y: 100 });

    expect(test.controller.end(test.event(500, 300), "title")).toBe(true);
    expect(test.releases).toEqual([1]);
    expect(test.dragStates).toEqual(["title", null]);
  });

  it("uses the same bounded coordinate behavior for a touch Pointer event", () => {
    const test = createHarness();
    test.controller.begin(test.event(-30, 900, 9), "caption");
    test.controller.move(test.event(10_000, -30, 9), "caption");
    test.controller.end(test.event(10_000, -30, 9), "caption");

    expect(test.updates).toEqual([
      { id: "caption", x: 0, y: 100 },
      { id: "caption", x: 100, y: 0 },
    ]);
    expect(test.releases).toEqual([9]);
  });
});
