// Tests for DragDropHelper.
//
// We mock the DOM at the boundary: elements have datasets,
// classList, style, and bounding rects. No real browser needed.

import assert from "node:assert/strict";
import { DragDropHelper, rects_overlap, type DragCallbacks, type DropTarget } from "./drag_drop";

// --- Minimal DOM mocks ---

type MockRect = { left: number; right: number; top: number; bottom: number };

class MockElement {
    dataset: Record<string, string> = {};
    classList: Set<string> = new Set();
    style: Record<string, any> = {};
    draggable = false;
    offsetLeft = 0;
    offsetTop = 0;
    _rect: MockRect = { left: 0, right: 100, top: 0, bottom: 50 };
    _listeners: Map<string, ((e: any) => void)[]> = new Map();
    _captured_pointer: number | undefined;

    addEventListener(type: string, fn: (e: any) => void) {
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type)!.push(fn);
    }

    _fire(type: string, event: any = {}) {
        const defaults = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: 0, clientY: 0, pointerId: 1,
        };
        const e = { ...defaults, ...event };
        for (const fn of this._listeners.get(type) ?? []) {
            fn(e);
        }
    }

    getBoundingClientRect(): MockRect { return this._rect; }
    setPointerCapture(_id: number) { this._captured_pointer = _id; }
    releasePointerCapture(_id: number) { this._captured_pointer = undefined; }
}

// Mock document.elementsFromPoint and querySelectorAll.
const _elements_at_point: MockElement[] = [];
const _all_elements: MockElement[] = [];

(globalThis as any).document = {
    elementsFromPoint: () => _elements_at_point,
    querySelectorAll: (selector: string) => {
        if (selector === ".drop_target") {
            return _all_elements.filter((e) => e.classList.has("drop_target"));
        }
        return [];
    },
};

function make_callbacks(): DragCallbacks & { rejects: HTMLElement[]; redraws: number } {
    return {
        rejects: [],
        redraws: 0,
        is_inside_board: () => true,
        overlaps_existing_stack: () => false,
        on_reject: function(div: HTMLElement) { this.rejects.push(div); },
        on_redraw: function() { this.redraws++; },
    };
}

// --- rects_overlap tests ---

// Story: two card stacks are side by side, not touching.
{
    const a = { left: 0, right: 50, top: 0, bottom: 30 };
    const b = { left: 60, right: 110, top: 0, bottom: 30 };
    assert.equal(rects_overlap(a, b), false);
    console.log("  rects_overlap: no overlap ✓");
}

// Story: a dragged stack hovers over a drop target.
{
    const a = { left: 40, right: 90, top: 0, bottom: 30 };
    const b = { left: 60, right: 110, top: 0, bottom: 30 };
    assert.equal(rects_overlap(a, b), true);
    console.log("  rects_overlap: partial overlap ✓");
}

// Story: one rect completely inside another.
{
    const a = { left: 10, right: 40, top: 5, bottom: 25 };
    const b = { left: 0, right: 100, top: 0, bottom: 50 };
    assert.equal(rects_overlap(a, b), true);
    console.log("  rects_overlap: contained ✓");
}

// --- accept_click tests ---

// Story: I register a click handler on a card. When the user
// taps it (pointerdown + pointerup without moving), the
// handler fires.
{
    const cb = make_callbacks();
    const helper = new DragDropHelper(cb);
    const div = new MockElement();
    let clicked = false;

    // Register the draggable div.
    helper.enable_drag({
        div: div as any,
        handle_dragstart: () => {},
        handle_ordinary_move: () => {},
    });

    // Register a click on a child element.
    const clickable = new MockElement();
    clickable._rect = { left: 10, right: 40, top: 5, bottom: 25 };
    helper.accept_click({ div: clickable as any, on_click: () => { clicked = true; } });

    // Simulate: pointerdown on the clickable, no move, pointerup.
    _elements_at_point.length = 0;
    _elements_at_point.push(clickable);

    div._fire("pointerdown", { clientX: 20, clientY: 15 });
    div._fire("pointerup", { clientX: 20, clientY: 15 });

    assert.equal(clicked, true);
    assert.equal(cb.redraws, 1);
    console.log("  accept_click: tap fires click handler ✓");
}

// --- accept_drop tests ---

// Story: I drag a hand card onto a merge zone. The drop
// target's on_drop fires.
{
    const cb = make_callbacks();
    const helper = new DragDropHelper(cb);
    const div = new MockElement();
    div.offsetLeft = 50;
    div.offsetTop = 50;
    div._rect = { left: 50, right: 100, top: 50, bottom: 80 };

    let dragstarted = false;
    let moved = false;

    // Drop targets are registered during handle_dragstart, which
    // fires after the first pointermove — same as the real game.
    const target_div = new MockElement();
    target_div._rect = { left: 200, right: 260, top: 50, bottom: 80 };
    let dropped = false;
    let hovered = false;
    let left = false;

    helper.enable_drag({
        div: div as any,
        handle_dragstart: () => {
            dragstarted = true;
            helper.accept_drop({
                div: target_div as any,
                on_over: () => { hovered = true; },
                on_leave: () => { left = true; },
                on_drop: () => { dropped = true; },
            });
        },
        handle_ordinary_move: () => { moved = true; },
    });

    _all_elements.length = 0;
    _all_elements.push(target_div);
    _elements_at_point.length = 0;

    // pointerdown.
    div._fire("pointerdown", { clientX: 75, clientY: 65 });
    assert.equal(dragstarted, false, "drag hasn't started yet");

    // pointermove — starts the drag.
    div._fire("pointermove", { clientX: 76, clientY: 66 });
    assert.equal(dragstarted, true, "drag started on first move");

    // pointermove over the target — simulate overlap by moving div's rect.
    div._rect = { left: 200, right: 250, top: 50, bottom: 80 };
    div._fire("pointermove", { clientX: 225, clientY: 65 });
    assert.equal(hovered, true, "on_over fired");

    // pointerup on the target.
    div._fire("pointerup", { clientX: 225, clientY: 65 });
    assert.equal(left, true, "on_leave fired before drop");
    assert.equal(dropped, true, "on_drop fired");
    assert.equal(moved, false, "ordinary move did NOT fire");
    console.log("  accept_drop: drag onto target fires on_drop ✓");
}

// --- Ordinary move (no drop target) ---

// Story: I drag a stack to empty board space. No merge zone
// is nearby. The handle_ordinary_move callback fires.
{
    const cb = make_callbacks();
    const helper = new DragDropHelper(cb);
    const div = new MockElement();
    div.offsetLeft = 50;
    div.offsetTop = 50;
    div._rect = { left: 50, right: 100, top: 50, bottom: 80 };

    let moved = false;
    helper.enable_drag({
        div: div as any,
        handle_dragstart: () => {},
        handle_ordinary_move: () => { moved = true; },
    });

    _all_elements.length = 0;
    _elements_at_point.length = 0;

    div._fire("pointerdown", { clientX: 75, clientY: 65 });
    div._fire("pointermove", { clientX: 76, clientY: 66 });
    div._fire("pointerup", { clientX: 76, clientY: 66 });

    assert.equal(moved, true, "ordinary move fired");
    console.log("  ordinary move: drop on empty board ✓");
}

// --- Scold when dropped outside board ---

// Story: I drag a card off the board. The game scolds me.
{
    const cb = make_callbacks();
    cb.is_inside_board = () => false;

    const helper = new DragDropHelper(cb);
    const div = new MockElement();
    div.offsetLeft = 50;
    div.offsetTop = 50;

    let moved = false;
    helper.enable_drag({
        div: div as any,
        handle_dragstart: () => {},
        handle_ordinary_move: () => { moved = true; },
    });

    _all_elements.length = 0;
    _elements_at_point.length = 0;

    div._fire("pointerdown", { clientX: 75, clientY: 65 });
    div._fire("pointermove", { clientX: 76, clientY: 66 });
    div._fire("pointerup", { clientX: 76, clientY: 66 });

    assert.equal(moved, false, "ordinary move did NOT fire");
    assert.equal(cb.rejects.length, 1, "on_reject fired");
    console.log("  reject: drop outside board ✓");
}

console.log("\nAll drag_drop tests passed.");
