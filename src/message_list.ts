import type { Message } from "./backend/db_types";
import type { Filter } from "./backend/filter";

import * as zulip_client from "./backend/zulip_client";
import { MessageRow } from "./message_row";
import { MessageRowWidget } from "./message_row_widget";
import { SmartList } from "./smart_list";

type MessageListConfig = {
    messages: Message[];
    filter: Filter;
    max_width: number;
    topic_id: number | undefined;
};

export class MessageList {
    div: HTMLDivElement;
    filter: Filter;
    smart_list: SmartList;
    index_map: Map<number, number>;
    rows: Message[];
    pending_index: number | undefined;
    done_loading: boolean;
    topic_id: number | undefined;

    constructor(config: MessageListConfig) {
        const self = this;
        const { messages, filter, max_width, topic_id } = config;

        const rows = [...messages];

        this.filter = filter;
        this.done_loading = false;

        this.index_map = new Map<number, number>();

        const div = document.createElement("div");

        const smart_list = new SmartList({
            size: rows.length,
            get_div(index: number) {
                const message = rows[index];

                // remember our index for updates
                self.index_map.set(message.id, index);

                const message_row = new MessageRow(message);
                const message_row_widget = new MessageRowWidget(
                    message_row,
                    topic_id,
                );

                return message_row_widget.div;
            },
            when_done() {
                self.done_loading = true;
                if (self.pending_index !== undefined) {
                    smart_list.scroll_index_to_top(self.pending_index);
                } else {
                    self.maybe_go_to_first_unread();
                }
            },
        });

        div.style.minWidth = "350px";
        div.style.maxWidth = `${max_width}px`;
        div.tabIndex = 0;
        div.classList.add("keyboard-scroll");
        div.append(smart_list.div);

        this.div = div;
        this.rows = rows;
        this.smart_list = smart_list;
        this.topic_id = topic_id;
    }

    maybe_go_to_first_unread() {
        const rows = this.rows;
        const smart_list = this.smart_list;

        const unread_index = rows.findIndex((row) => row.unread);
        if (unread_index >= 0) {
            smart_list.scroll_index_to_top(unread_index);
        }
    }

    go_to_message_id(message_id: number) {
        const rows = this.rows;
        const smart_list = this.smart_list;

        console.log("trying to go to", message_id);
        const index = rows.findIndex((message) => message.id === message_id);
        if (index >= 0) {
            if (this.done_loading) {
                smart_list.scroll_index_to_top(index);
            } else {
                this.pending_index = index;
            }
        }
    }

    focus() {
        this.div.focus();
    }

    mark_last_message_unread(): void {
        const last = this.rows.at(-1);
        if (last !== undefined) {
            zulip_client.mark_message_id_unread(last.id);
        }
    }

    mark_topic_read() {
        const unread_message_ids = this.rows
            .filter((message) => message.unread)
            .map((message) => message.id);

        if (unread_message_ids) {
            zulip_client.mark_message_ids_unread(unread_message_ids);
        }
    }

    refresh_message_ids(message_ids: number[]): void {
        const index_map = this.index_map;

        for (const message_id of message_ids) {
            const index = index_map.get(message_id);

            if (index !== undefined) {
                this.smart_list.replace(index);
            }
        }
    }

    append_message(message: Message) {
        const smart_list = this.smart_list;
        const filter = this.filter;
        const rows = this.rows;

        if (!filter.predicate(message)) {
            return;
        }

        rows.push(message);
        this.index_map.set(message.id, rows.length - 1);

        const message_row = new MessageRow(message);
        const message_row_widget = new MessageRowWidget(
            message_row,
            this.topic_id,
        );

        const was_near_bottom = this.near_bottom();
        console.log("was_near_bottom", was_near_bottom);

        smart_list.append(message_row_widget.div);

        if (was_near_bottom) {
            smart_list.scroll_to_bottom();
        }
    }

    near_bottom(): boolean {
        const div = this.div;
        console.log(div.scrollTop);
        console.log(div.scrollHeight);
        console.log(div.clientHeight);

        return div.scrollTop > div.scrollHeight - div.clientHeight - 300;
    }
}
