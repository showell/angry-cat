import * as model from "./backend/model";

import type { ChannelRow } from "./channel_row";
import * as table_widget from "./dom/table_widget";
import * as topic_row_widget from "./dom/topic_row_widget";
import { get_display_rows, sort_recent } from "./grouping_sort";
import type { Navigator } from "./navigator";

import { SortControls } from "./sort_controls";
import type { TopicRow } from "./topic_row";

export class TopicList {
    div: HTMLDivElement;
    all_topic_rows: TopicRow[];
    topic_rows: TopicRow[];
    sort_controls: SortControls;
    stream_id: number;
    topic_id?: number;
    navigator: Navigator;

    constructor(channel_row: ChannelRow, navigator: Navigator) {
        this.navigator = navigator;
        this.stream_id = channel_row.stream_id();

        // these get re-assigned in populate_topic_rows
        this.all_topic_rows = [];
        this.topic_rows = [];

        this.populate_topic_rows();

        this.sort_controls = new SortControls({
            initial_max: this.all_topic_rows.length,
            count_label: "Most Messages",
            on_change: () => {
                this.populate_topic_rows();
                this.redraw();
                this.sort_controls.repopulate(this.all_topic_rows.length);
            },
        });

        const div = document.createElement("div");
        div.append(this.make_table());

        this.div = div;
    }

    get_adjuster_div(): HTMLDivElement {
        return this.sort_controls.div;
    }

    has_selection(): boolean {
        return this.topic_id !== undefined;
    }

    is_selected_topic(topic_id: number): boolean {
        return this.topic_id === topic_id;
    }

    get_topic_id(): number | undefined {
        return this.topic_id;
    }

    refresh_topics_with_topic_selected(topic_id: number): void {
        this.topic_id = topic_id;
        this.refresh();
    }

    get_topic_name(): string | undefined {
        const current_topic_row = this.get_topic_row();
        if (current_topic_row === undefined) {
            return undefined;
        }
        return current_topic_row.name();
    }

    get_topic_row(): TopicRow | undefined {
        const topic_id = this.topic_id;
        const topic_rows = this.all_topic_rows;

        if (topic_id === undefined) {
            return undefined;
        }

        return topic_rows.find((row) => row.topic_id() === topic_id);
    }

    populate_topic_rows() {
        this.all_topic_rows = model.get_topic_rows(this.stream_id);
        sort_recent(this.all_topic_rows);
        this.topic_rows = get_display_rows(
            this.all_topic_rows,
            this.sort_controls?.topic_sort.mode ?? "alpha",
            this.sort_controls?.batch_size ?? 10,
        );
    }

    make_table(): HTMLTableElement {
        const topic_id = this.topic_id;
        const topic_rows = this.topic_rows;
        const navigator = this.navigator;

        const row_widgets = [];

        for (const topic_row of topic_rows) {
            const selected = topic_row.topic_id() === topic_id;
            const row_widget = topic_row_widget.row_widget(
                topic_row,
                selected,
                navigator,
            );
            row_widgets.push(row_widget);
        }

        const columns = ["Unread", "Topic name", "Messages"];
        return table_widget.table(columns, row_widgets);
    }

    refresh() {
        this.populate_topic_rows();
        this.redraw();
    }

    redraw() {
        const div = this.div;

        div.innerHTML = "";
        div.append(this.make_table());
    }

    select_topic_id(topic_id: number) {
        this.topic_id = topic_id;
        this.refresh();
    }

    clear_selection(): void {
        this.topic_id = undefined;
        this.refresh();
    }
}
