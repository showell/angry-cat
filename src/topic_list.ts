import * as model from "./backend/model";

import type { ChannelRow, TopicRow } from "./row_types";
import type { SearchWidget } from "./search_widget";

import * as table_widget from "./dom/table_widget";
import * as topic_row_widget from "./dom/topic_row_widget";

import * as batch_count from "./batch_count";
import { Cursor } from "./cursor";

export class TopicList {
    div: HTMLDivElement;
    all_topic_rows: TopicRow[];
    topic_rows: TopicRow[];
    cursor: Cursor;
    adjuster_div: HTMLDivElement;
    batch_size: number;
    stream_id: number;
    topic_id?: number;
    search_widget: SearchWidget;

    constructor(channel_row: ChannelRow, search_widget: SearchWidget) {
        const self = this;

        this.search_widget = search_widget;
        this.stream_id = channel_row.stream_id();

        this.batch_size = 10;

        // these get re-assigned in populate_topic_rows
        this.all_topic_rows = [];
        this.topic_rows = [];

        const cursor = new Cursor();
        this.populate_topic_rows();
        cursor.set_count(this.topic_rows.length);

        this.adjuster_div = batch_count.adjuster({
            min: 1,
            max: this.all_topic_rows.length,
            value: this.batch_size,
            callback(batch_size: number) {
                self.batch_size = batch_size;
                self.topic_rows = self.all_topic_rows.slice(0, batch_size);
                self.sort_alpha(self.topic_rows);
                self.redraw();
            },
        });

        this.cursor = cursor;

        const div = document.createElement("div");
        div.append(this.make_table());

        this.div = div;
    }

    get_adjuster_div(): HTMLDivElement {
        return this.adjuster_div;
    }

    has_selection(): boolean {
        return this.cursor.has_selection();
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

    get_index_for(topic_id: number): number {
        const topic_rows = this.topic_rows;

        return topic_rows.findIndex((topic_row) => {
            return topic_row.topic_id() === topic_id;
        });
    }

    update_cursor(): void {
        const cursor = this.cursor;
        const topic_rows = this.topic_rows;

        cursor.set_count(topic_rows.length);
        if (this.topic_id === undefined) {
            this.cursor.selected_index = undefined;
        } else {
            this.cursor.selected_index = this.get_index_for(this.topic_id);
        }
    }

    get_topic_row(): TopicRow | undefined {
        const index = this.cursor.selected_index;

        if (index === undefined) return undefined;

        return this.topic_rows[index];
    }

    get_topic_id_from_cursor(): number | undefined {
        const topic_row = this.get_topic_row();

        if (topic_row === undefined) return undefined;

        return topic_row.topic_id();
    }

    set_topic_id_from_cursor(): void {
        this.topic_id = this.get_topic_id_from_cursor();
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

    populate_topic_rows() {
        const stream_id = this.stream_id!;
        const batch_size = this.batch_size;

        this.all_topic_rows = model.get_topic_rows(stream_id);

        this.sort_recent(this.all_topic_rows);

        const topic_rows = this.all_topic_rows.slice(0, batch_size);
        this.sort_alpha(topic_rows);

        this.topic_rows = topic_rows;
    }

    make_table(): HTMLTableElement {
        const topic_rows = this.topic_rows;
        const search_widget = this.search_widget;
        const cursor = this.cursor;

        const row_widgets = [];

        for (let i = 0; i < topic_rows.length; ++i) {
            const topic_row = topic_rows[i];
            const selected = cursor.is_selecting(i);
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

        this.update_cursor();

        div.innerHTML = "";
        div.append(this.make_table());
    }

    select_topic_id(topic_id: number) {
        const index = this.get_index_for(topic_id);
        this.cursor.select_index(index);
        this.set_topic_id_from_cursor();
        this.refresh();
    }

    clear_selection(): void {
        this.cursor.clear();
        this.set_topic_id_from_cursor();
        this.refresh();
    }
}
