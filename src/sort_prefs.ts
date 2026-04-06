// Session-level sort preferences per pane type ("channel" or "topic").

import type { SortMode } from "./grouping_sort";

const prefs = new Map<string, SortMode>();

export function get(pane_key: string): SortMode {
    return prefs.get(pane_key) ?? "recent";
}

export function set(pane_key: string, mode: SortMode): void {
    prefs.set(pane_key, mode);
}
