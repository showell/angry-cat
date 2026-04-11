// Tests for popup focus behavior.
//
// The user's experience: when a popup appears, the confirm button
// should be focused so they can press Enter to confirm. When a popup
// has both confirm and cancel, confirm is still auto-focused.

import assert from "node:assert/strict";
import * as popup from "../popup";
import { get_last_focused, clear_focus_tracking, MockElement } from "./shims";

// After pop(), the confirm button is focused.
{
    clear_focus_tracking();

    const div = document.createElement("div") as unknown as HTMLDivElement;
    let confirmed = false;

    popup.pop({
        div,
        confirm_button_text: "OK",
        callback: () => { confirmed = true; },
    });

    const focused = get_last_focused();
    assert(focused !== undefined, "something should be focused after pop()");
    assert.equal(focused!._innerText, "OK");
}

// Confirm button callback fires when clicked.
{
    const div = document.createElement("div") as unknown as HTMLDivElement;
    let confirmed = false;

    const p = popup.pop({
        div,
        confirm_button_text: "Yes",
        callback: () => { confirmed = true; },
    });

    // Simulate clicking the confirm button.
    (p.confirm_button.button as any)._fire("click");
    assert(confirmed, "callback should fire on confirm click");
}

// Popup with cancel button — confirm is still focused.
{
    clear_focus_tracking();

    const div = document.createElement("div") as unknown as HTMLDivElement;

    popup.pop({
        div,
        confirm_button_text: "Delete",
        cancel_button_text: "Cancel",
        callback: () => {},
    });

    const focused = get_last_focused();
    assert.equal(focused!._innerText, "Delete");
}

// auto_focus: false skips the confirm button focus, so the caller
// can focus a custom element (e.g. a textarea or code block).
{
    clear_focus_tracking();

    const div = document.createElement("div") as unknown as HTMLDivElement;
    const custom_input = document.createElement("input") as unknown as MockElement;

    popup.pop({
        div,
        confirm_button_text: "Save",
        auto_focus: false,
        callback: () => {},
    });

    // Nothing should be focused by the popup itself.
    const after_pop = get_last_focused();
    assert(
        after_pop === undefined || after_pop._innerText !== "Save",
        "confirm button should NOT be focused when auto_focus is false",
    );

    // The caller focuses their own element.
    custom_input.focus();
    assert.equal(get_last_focused(), custom_input);
}

// auto_focus defaults to true (confirm focused).
{
    clear_focus_tracking();

    const div = document.createElement("div") as unknown as HTMLDivElement;

    popup.pop({
        div,
        confirm_button_text: "OK",
        callback: () => {},
    });

    assert.equal(get_last_focused()!._innerText, "OK");
}

// finish() calls the callback.
{
    const div = document.createElement("div") as unknown as HTMLDivElement;
    let called = false;

    const p = popup.pop({
        div,
        confirm_button_text: "OK",
        callback: () => { called = true; },
    });

    p.finish(() => { called = true; });
    assert(called);
}

console.log("  popup_test: OK");
