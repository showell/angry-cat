import type { Message } from "../backend/db_types";
import type { MessageCallback } from "../backend/zulip_client";

import { DB } from "../backend/database";
import { topic_filter } from "../backend/filter";
import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

type RowType = {
    message: Message;
    value_string: string;
};

export class NetworkHelper {
    channel_id: number;

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

        if (messages.length === 0) {
            return undefined;
        }

        const message = messages[messages.length - 1];

        return data_from_message(message, content_label);
    }
}

function data_from_message(
    message: Message,
    content_label: string,
): RowType | undefined {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message.content, "text/html");

    const div = doc.querySelector("div.codehilite");
    if (div && div.getAttribute("data-code-language") === content_label) {
        const pre = div.querySelector("pre");
        if (pre) {
            return {
                message,
                value_string: pre.innerText,
            };
        }
    }
    return undefined;
}
