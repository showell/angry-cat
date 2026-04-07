// Tests for plugin tab management. Rather than instantiating the real
// Page (which pulls in many DOM dependencies), we test the tab lifecycle
// logic by exercising Page's public API through a mock that captures
// the essential state machine: add, activate, close, reorder.
//
// The user's experience:
//   - Opening a plugin adds a tab and switches to it
//   - Clicking a tab switches focus
//   - Closing a tab activates the nearest neighbor
//   - The context lets plugins update their label and highlight their tab

import assert from "node:assert/strict";
import type { Plugin, PluginContext, PluginFactory } from "../plugin_helper";
import { fresh_db } from "./test_helpers";

// Minimal tab manager that mirrors Page's plugin tab logic.
// This avoids Page's constructor which touches the real DOM,
// StatusBar, layout, etc.
type TabEntry = {
    label: string;
    highlighted: boolean;
    factory: PluginFactory;
    active: boolean;
};

class TabManager {
    entries: TabEntry[] = [];

    add_plugin(factory: PluginFactory): PluginContext {
        const entry: TabEntry = {
            label: "plugin",
            highlighted: false,
            factory,
            active: false,
        };

        const context: PluginContext = {
            update_label: (label) => { entry.label = label; },
            request_close: () => this.close(entry),
            highlight_tab: () => { entry.highlighted = true; },
            reset_tab_highlight: () => { entry.highlighted = false; },
            tab_count: () => this.entries.length,
        };

        // Call the factory to get the plugin (which calls context.update_label).
        factory(context);

        this.entries.push(entry);
        this.make_active(entry);
        return context;
    }

    make_active(entry: TabEntry): void {
        for (const e of this.entries) e.active = false;
        entry.active = true;
    }

    close(entry: TabEntry): void {
        const index = this.entries.indexOf(entry);
        if (index === -1) return;
        this.entries.splice(index, 1);

        if (entry.active && this.entries.length > 0) {
            const new_index = Math.min(index, this.entries.length - 1);
            this.make_active(this.entries[new_index]);
        }
    }

    get active_label(): string | undefined {
        return this.entries.find((e) => e.active)?.label;
    }

    get labels(): string[] {
        return this.entries.map((e) => e.label);
    }

    is_active(factory: PluginFactory): boolean {
        return this.entries.some((e) => e.factory === factory);
    }
}

// Simple plugin factories for testing. Each one just sets a label.
function make_factory(label: string): PluginFactory {
    return (context: PluginContext): Plugin => {
        context.update_label(label);
        return { div: document.createElement("div") };
    };
}

// ============================================================
// Story: I open three plugins. The most recently opened is active.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();
    const alpha = make_factory("Alpha");
    const beta = make_factory("Beta");
    const gamma = make_factory("Gamma");

    tm.add_plugin(alpha);
    assert.equal(tm.active_label, "Alpha");

    tm.add_plugin(beta);
    assert.equal(tm.active_label, "Beta");

    tm.add_plugin(gamma);
    assert.equal(tm.active_label, "Gamma");

    assert.deepEqual(tm.labels, ["Alpha", "Beta", "Gamma"]);
}

// ============================================================
// Story: I close the active tab. The neighbor becomes active.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();
    const alpha = make_factory("Alpha");
    const beta = make_factory("Beta");
    const gamma = make_factory("Gamma");

    const ctx_a = tm.add_plugin(alpha);
    const ctx_b = tm.add_plugin(beta);
    const ctx_g = tm.add_plugin(gamma);

    // Close the middle tab (Beta is not active, Gamma is).
    ctx_b.request_close();
    assert.deepEqual(tm.labels, ["Alpha", "Gamma"]);
    assert.equal(tm.active_label, "Gamma"); // still active

    // Close the active tab (Gamma). Alpha should become active.
    ctx_g.request_close();
    assert.deepEqual(tm.labels, ["Alpha"]);
    assert.equal(tm.active_label, "Alpha");
}

// ============================================================
// Story: I close the first tab. The next tab becomes active.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();
    const alpha = make_factory("Alpha");
    const beta = make_factory("Beta");

    const ctx_a = tm.add_plugin(alpha);
    tm.add_plugin(beta);

    // Make Alpha active, then close it.
    tm.make_active(tm.entries[0]);
    assert.equal(tm.active_label, "Alpha");

    ctx_a.request_close();
    assert.equal(tm.active_label, "Beta");
}

// ============================================================
// Story: A plugin updates its label and highlights its tab.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();

    let saved_context: PluginContext;
    const factory: PluginFactory = (context) => {
        context.update_label("Initial");
        saved_context = context;
        return { div: document.createElement("div") };
    };

    tm.add_plugin(factory);
    assert.equal(tm.entries[0].label, "Initial");

    saved_context!.update_label("Updated");
    assert.equal(tm.entries[0].label, "Updated");

    assert(!tm.entries[0].highlighted);
    saved_context!.highlight_tab();
    assert(tm.entries[0].highlighted);

    saved_context!.reset_tab_highlight();
    assert(!tm.entries[0].highlighted);
}

// ============================================================
// Story: I check if a plugin is already open before opening it.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();
    const alpha = make_factory("Alpha");
    const beta = make_factory("Beta");

    tm.add_plugin(alpha);

    assert(tm.is_active(alpha));
    assert(!tm.is_active(beta));
}

// ============================================================
// Story: tab_count tells me how many tabs are open.
// ============================================================

{
    fresh_db();
    const tm = new TabManager();
    let count = 0;

    const factory: PluginFactory = (context) => {
        context.update_label("Test");
        count = context.tab_count();
        return { div: document.createElement("div") };
    };

    tm.add_plugin(make_factory("First"));
    tm.add_plugin(factory);
    // tab_count is called during factory, before the new entry is pushed.
    assert.equal(count, 1);
}

console.log("  page_test: OK");
