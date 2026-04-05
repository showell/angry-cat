export type SortMode = "alpha" | "recent" | "count";

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

export class TopicSort {
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
