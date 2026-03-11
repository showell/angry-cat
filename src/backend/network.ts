import type { Message } from "./db_types";
import type { MessageCallback } from "./zulip_client";
import type { ZulipEvent } from "./event";

import { get_dom_parser } from "../parser";

import { DB } from "./database";
import { EventFlavor } from "./event";
import { topic_filter } from "./filter";
import * as model from "./model";
import * as zulip_client from "./zulip_client";

export type RowType = {
    message: Message;
    json_string: string;
};

type EventListenerInfo = {
    category: string;
    key: string;
    content_label: string;
    callback: (row: RowType) => void;
};

export class NetworkHelper {
    channel_id: number;
    event_listener_info?: EventListenerInfo;

    constructor(channel_id: number) {
        this.channel_id = channel_id;
    }

    serialize(info: {
        category: string;
        key: string;
        content_label: string;
        value: object;
        message_callback: MessageCallback;
    }): void {
        const channel_id = this.channel_id;

        const { category, key, content_label, value, message_callback } = info;

        const topic_name = `__${category}_${key}__`;

        const json = JSON.stringify(value);
        const content = `~~~ ${content_label}\n${json}`;

        zulip_client.send_message(
            {
                channel_id,
                topic_name,
                content,
            },
            message_callback,
        );
    }

    get_rows_for_category(info: {
        category: string;
        key: string;
        content_label: string;
    }): RowType[] {
        const channel_id = this.channel_id;

        const { category, key, content_label } = info;

        const topic_name = `__${category}_${key}__`;
        const topic_id = DB.topic_map.get_topic_id(channel_id, topic_name);

        if (topic_id === undefined) {
            return [];
        }

        const filter = topic_filter(topic_id);
        const messages = model.filtered_messages(filter);

        messages.sort((m1, m2) => m1.id - m2.id);

        const rows = [];

        for (const message of messages) {
            const row = data_from_message(message, content_label);

            if (row) {
                rows.push(row);
            }
        }

        return rows;
    }

    get_most_recent_row_for_category(info: {
        category: string;
        key: string;
        content_label: string;
    }): RowType | undefined {
        const channel_id = this.channel_id;
        const { category, key, content_label } = info;

        const topic_name = `__${category}_${key}__`;
        const topic_id = DB.topic_map.get_topic_id(channel_id, topic_name);

        const filter = topic_filter(topic_id);
        const messages = model.filtered_messages(filter);

        messages.sort((m1, m2) => m1.id - m2.id);

        if (messages.length === 0) {
            return undefined;
        }

        const message = messages[messages.length - 1];

        return data_from_message(message, content_label);
    }

    handle_zulip_event(zulip_event: ZulipEvent): void {
        const event_listener_info = this.event_listener_info;
        const channel_id = this.channel_id;

        if (event_listener_info === undefined) {
            return;
        }

        if (zulip_event.flavor === EventFlavor.MESSAGE) {
            const message = zulip_event.message;
            const { category, key, content_label, callback } =
                event_listener_info;

            const topic_name = `__${category}_${key}__`;
            const topic_id = DB.topic_map.get_topic_id(channel_id, topic_name);

            if (message.topic_id === topic_id) {
                const row = data_from_message(message, content_label);

                if (row) {
                    callback(row);
                }
            }
        }
    }

    set_event_listener_for_category(event_listener_info: EventListenerInfo) {
        this.event_listener_info = event_listener_info;
    }
}

function data_from_message(
    message: Message,
    content_label: string,
): RowType | undefined {
    const parser = get_dom_parser();
    const doc = parser.parseFromString(message.content, "text/html");

    const div = doc.querySelector("div.codehilite");
    if (div && div.getAttribute("data-code-language") === content_label) {
        const pre = div.querySelector("pre");
        if (pre) {
            return {
                message,
                json_string: pre.innerText,
            };
        }
    }
    return undefined;
}
