import type { TopicRow } from "./row_types";

export type SortMode = "alpha" | "recent" | "count";

export interface MessageGrouping {
    name(): string;
    num_messages(): number;
}

const next_mode: Record<SortMode, SortMode> = {
    alpha: "recent",
    recent: "count",
    count: "alpha",
};

const mode_label: Record<SortMode, string> = {
    alpha: "A-Z",
    recent: "Recent",
    count: "Most Messages",
};

export class SortCycle {
    mode: SortMode;

    constructor() {
        this.mode = "alpha";
    }

    toggle(): void {
        this.mode = next_mode[this.mode];
    }

    label(): string {
        return mode_label[this.mode];
    }
}

export function sort_recent(topic_rows: TopicRow[]): void {
    topic_rows.sort((a, b) => b.last_msg_id() - a.last_msg_id());
}

export function get_display_rows<T extends MessageGrouping>(
    all_rows: T[],
    sort_mode: SortMode,
    batch_size: number,
): T[] {
    if (sort_mode === "recent") {
        return [...all_rows];
    }
    if (sort_mode === "count") {
        const rows = [...all_rows];
        rows.sort((a, b) => b.num_messages() - a.num_messages());
        return rows;
    }
    const rows = all_rows.slice(0, batch_size);
    rows.sort((a, b) => a.name().localeCompare(b.name()));
    return rows;
}
