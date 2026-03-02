import * as model from "./backend/model";

import type { ChannelRow } from "./row_types";
import type { SearchWidget } from "./search_widget";

import * as channel_row_widget from "./dom/channel_row_widget";
import * as table_widget from "./dom/table_widget";

export class ChannelList {
    search_widget: SearchWidget;
    div: HTMLDivElement;
    channel_id?: number;
    channel_rows: ChannelRow[];

    constructor(search_widget: SearchWidget) {
        const div = document.createElement("div");

        this.channel_rows = this.populate_channel_rows();

        this.search_widget = search_widget;
        this.div = div;
    }

    get_channel_id(): number | undefined {
        return this.channel_id;
    }

    has_selection(): boolean {
        return this.channel_id !== undefined;
    }

    get_channel_row(): ChannelRow | undefined {
        const channel_id = this.channel_id;
        const channel_rows = this.channel_rows;

        if (channel_id === undefined) {
            return undefined;
        }

        return channel_rows.find((row) => row.stream_id() === channel_id);
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
        const channel_id = this.channel_id;
        const channel_rows = this.channel_rows;
        const search_widget = this.search_widget;
        const row_widgets = [];

        for (const channel_row of channel_rows) {
            const selected = channel_row.stream_id() === channel_id;
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

        div.innerHTML = "";
        div.append(this.make_table());
    }

    select_channel_id(channel_id: number): void {
        this.channel_id = channel_id;
        this.populate();
    }

    clear_selection(): void {
        this.channel_id = undefined;
        this.populate();
    }
}
