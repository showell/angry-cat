import * as model from "./backend/model";

import type { ChannelRow, TopicRow } from "./row_types";
import type { SearchWidget } from "./search_widget";

import * as table_widget from "./dom/table_widget";
import * as topic_row_widget from "./dom/topic_row_widget";

import * as batch_count from "./batch_count";

export class TopicList {
    div: HTMLDivElement;
    all_topic_rows: TopicRow[];
    topic_rows: TopicRow[];
    adjuster_div: HTMLDivElement;
    batch_size: number;
    stream_id: number;
    topic_id?: number;
    search_widget: SearchWidget;

    constructor(channel_row: ChannelRow, search_widget: SearchWidget) {
        this.search_widget = search_widget;
        this.stream_id = channel_row.stream_id();

        this.batch_size = 10;

        // these get re-assigned in populate_topic_rows
        this.all_topic_rows = [];
        this.topic_rows = [];

        this.populate_topic_rows();

        this.adjuster_div = batch_count.adjuster({
            min: 1,
            max: this.all_topic_rows.length,
            value: this.batch_size,
            callback: (batch_size: number) => {
                this.batch_size = batch_size;
                this.topic_rows = this.get_display_rows(batch_size);
                this.redraw();
            },
        });

        const div = document.createElement("div");
        div.append(this.make_table());

        this.div = div;
    }

    get_adjuster_div(): HTMLDivElement {
        return this.adjuster_div;
    }

    has_selection(): boolean {
        return this.topic_id !== undefined;
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

    sort_recent(topic_rows: TopicRow[]) {
        topic_rows.sort((topic1, topic2) => {
            return topic2.last_msg_id() - topic1.last_msg_id();
        });
    }

    sort_alpha(topic_rows: TopicRow[]) {
        topic_rows.sort((topic1, topic2) => {
            return topic1.name().localeCompare(topic2.name());
        });
    }

    get_display_rows(batch_size: number): TopicRow[] {
        const rows = this.all_topic_rows.slice(0, batch_size);
        this.sort_alpha(rows);
        return rows;
    }

    populate_topic_rows() {
        this.all_topic_rows = model.get_topic_rows(this.stream_id);
        this.sort_recent(this.all_topic_rows);
        this.topic_rows = this.get_display_rows(this.batch_size);
    }

    make_table(): HTMLTableElement {
        const topic_id = this.topic_id;
        const topic_rows = this.topic_rows;
        const search_widget = this.search_widget;

        const row_widgets = [];

        for (const topic_row of topic_rows) {
            const selected = topic_row.topic_id() === topic_id;
            const row_widget = topic_row_widget.row_widget(
                topic_row,
                selected,
                search_widget,
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
