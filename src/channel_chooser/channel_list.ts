import * as model from "../backend/model";

import type { ChannelRow } from "../channel_row";
import * as table_widget from "../dom/table_widget";
import { get_display_rows, sort_recent } from "../grouping_sort";

import { SortControls } from "../sort_controls";
import * as channel_row_widget from "./channel_row_widget";

type Opts = {
    channel_id: number | undefined;
    handle_channel_chosen: (channel_id: number) => void;
    handle_channel_cleared: () => void;
};

export class ChannelList {
    div: HTMLDivElement;
    channel_id: number | undefined;
    handle_channel_chosen: (channel_id: number) => void;
    handle_channel_cleared: () => void;
    all_channel_rows: ChannelRow[];
    channel_rows: ChannelRow[];
    sort_controls: SortControls;

    constructor(opts: Opts) {
        this.channel_id = opts.channel_id;
        this.handle_channel_chosen = opts.handle_channel_chosen;
        this.handle_channel_cleared = opts.handle_channel_cleared;

        // these get re-assigned in populate_channel_rows
        this.all_channel_rows = [];
        this.channel_rows = [];

        this.populate_channel_rows();

        this.sort_controls = new SortControls({
            initial_max: this.all_channel_rows.length,
            count_label: "Most Topics",
            on_change: () => {
                this.populate_channel_rows();
                this.redraw();
                this.sort_controls.repopulate(this.all_channel_rows.length);
            },
        });

        this.div = document.createElement("div");
        this.redraw();
    }

    get_adjuster_div(): HTMLDivElement {
        return this.sort_controls.div;
    }

    get_channel_id(): number | undefined {
        return this.channel_id;
    }

    has_selection(): boolean {
        return this.channel_id !== undefined;
    }

    get_channel_row(): ChannelRow | undefined {
        const channel_id = this.channel_id;
        const channel_rows = this.all_channel_rows;

        if (channel_id === undefined) {
            return undefined;
        }

        return channel_rows.find((row) => row.stream_id() === channel_id);
    }

    populate_channel_rows(): void {
        this.all_channel_rows = model.get_channel_rows();
        sort_recent(this.all_channel_rows);
        this.channel_rows = get_display_rows(
            this.all_channel_rows,
            this.sort_controls?.topic_sort.mode ?? "alpha",
            this.sort_controls?.batch_size ?? 10,
        );
    }

    make_table(): HTMLElement {
        const self = this;
        const channel_id = this.channel_id;
        const channel_rows = this.channel_rows;
        const handle_channel_chosen = this.handle_channel_chosen;
        const handle_channel_cleared = this.handle_channel_cleared;
        const row_widgets = [];

        for (const channel_row of channel_rows) {
            const selected = channel_row.stream_id() === channel_id;
            const row_widget = channel_row_widget.row_widget({
                channel_row,
                selected,
                set_channel_id(channel_id: number) {
                    self.channel_id = channel_id;
                    self.refresh_completely();
                    handle_channel_chosen(channel_id);
                },
                clear_channel() {
                    self.channel_id = undefined;
                    self.refresh_completely();
                    handle_channel_cleared();
                },
            });
            row_widgets.push(row_widget);
        }

        const columns = ["Unread", "Channel", "Topics"];
        return table_widget.table(columns, row_widgets);
    }

    total_unread_count(): number {
        let count = 0;

        for (const channel_row of this.all_channel_rows) {
            count += channel_row.unread_count();
        }

        return count;
    }

    get_first_unread_channel_id(): number | undefined {
        return this.channel_rows.find((row) => row.unread_count() > 0)?.stream_id();
    }

    select_channel(channel_id: number): void {
        this.channel_id = channel_id;
        this.refresh_completely();
        this.handle_channel_chosen(channel_id);
    }

    refresh_completely() {
        this.populate_channel_rows();
        this.redraw();
    }

    redraw() {
        const div = this.div;
        div.innerHTML = "";
        div.append(this.make_table());
    }
}
