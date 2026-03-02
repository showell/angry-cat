import * as model from "./backend/model";

import type { ChannelRow } from "./row_types";
import type { SearchWidget } from "./search_widget";

import * as channel_row_widget from "./dom/channel_row_widget";
import * as table_widget from "./dom/table_widget";

import { Cursor } from "./cursor";

export class ChannelList {
    search_widget: SearchWidget;
    div: HTMLDivElement;
    channel_id?: number;
    channel_rows: ChannelRow[];
    cursor: Cursor;

    constructor(search_widget: SearchWidget) {
        const div = document.createElement("div");

        this.cursor = new Cursor();
        this.channel_rows = this.populate_channel_rows();

        this.search_widget = search_widget;
        this.div = div;
    }

    get_channel_id(): number | undefined {
        return this.channel_id;
    }

    has_selection(): boolean {
        return this.cursor.has_selection();
    }

    get_index_for(channel_id: number): number {
        const channel_rows = this.channel_rows;

        return channel_rows.findIndex((channel_row) => {
            return channel_row.stream_id() === channel_id;
        });
    }

    update_cursor(): void {
        const cursor = this.cursor;
        const channel_rows = this.channel_rows;

        cursor.set_count(channel_rows.length);
        if (this.channel_id === undefined) {
            this.cursor.selected_index = undefined;
        } else {
            this.cursor.selected_index = this.get_index_for(this.channel_id);
        }
    }

    get_channel_row(): ChannelRow | undefined {
        const index = this.cursor.selected_index;
        const channel_rows = this.channel_rows;

        if (index === undefined) return undefined;

        if (channel_rows === undefined) return undefined;

        return channel_rows[index];
    }

    get_channel_id_from_cursor(): number | undefined {
        const channel_row = this.get_channel_row();

        if (channel_row === undefined) return undefined;

        return channel_row.stream_id();
    }

    set_channel_id_from_cursor(): void {
        this.channel_id = this.get_channel_id_from_cursor();
    }

    sort(channel_rows: ChannelRow[]) {
        channel_rows.sort((c1, c2) => {
            return c2.last_msg_id() - c1.last_msg_id();
        });
    }

    populate_channel_rows(): ChannelRow[] {
        const channel_rows = model.get_channel_rows();
        this.sort(channel_rows);
        return channel_rows;
    }

    make_table(): HTMLElement {
        const channel_rows = this.channel_rows;
        const search_widget = this.search_widget;
        const cursor = this.cursor;
        const row_widgets = [];

        for (let i = 0; i < channel_rows.length; ++i) {
            const channel_row = channel_rows[i];
            const selected = cursor.is_selecting(i);
            const row_widget = channel_row_widget.row_widget(
                channel_row,
                selected,
                search_widget,
            );
            row_widgets.push(row_widget);
        }

        const columns = ["Unread", "Channel", "Topics"];
        return table_widget.table(columns, row_widgets);
    }

    unread_count(): number {
        let count = 0;

        for (const channel_row of this.channel_rows!) {
            count += channel_row.unread_count();
        }

        return count;
    }

    populate() {
        const div = this.div;

        this.channel_rows = this.populate_channel_rows();
        this.update_cursor();

        div.innerHTML = "";
        div.append(this.make_table());
    }

    select_channel_id(channel_id: number): void {
        const index = this.get_index_for(channel_id);
        this.cursor.select_index(index);
        this.set_channel_id_from_cursor();
        this.populate();
    }

    clear_selection(): void {
        this.cursor.clear();
        this.set_channel_id_from_cursor();
        this.populate();
    }
}
