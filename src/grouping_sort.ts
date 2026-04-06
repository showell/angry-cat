export type SortMode = "alpha" | "recent" | "count";

export interface MessageGrouping {
    name(): string;
    // num_children means messages for topics, topics for channels.
    num_children(): number;
    last_msg_id(): number;
}

const next_mode: Record<SortMode, SortMode> = {
    recent: "alpha",
    alpha: "count",
    count: "recent",
};

const mode_label: Record<SortMode, string> = {
    recent: "Most Recent",
    alpha: "A-Z",
    count: "Most Messages",
};

export class SortCycle {
    mode: SortMode;
    private labels: Record<SortMode, string>;

    constructor(count_label: string, initial_mode: SortMode) {
        this.mode = initial_mode;
        this.labels = { ...mode_label, count: count_label };
    }

    toggle(): void {
        this.mode = next_mode[this.mode];
    }

    label(): string {
        return this.labels[this.mode];
    }
}

export function sort_recent<T extends MessageGrouping>(rows: T[]): void {
    rows.sort((a, b) => b.last_msg_id() - a.last_msg_id());
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
        rows.sort((a, b) => b.num_children() - a.num_children());
        return rows;
    }
    const rows = all_rows.slice(0, batch_size);
    rows.sort((a, b) => a.name().localeCompare(b.name()));
    return rows;
}
