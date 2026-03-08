import type { JsonGameEvent } from "./game";
import type { Message } from "../backend/db_types";
import type { MessageCallback } from "../backend/zulip_client";

import { DB } from "../backend/database";
import { topic_filter } from "../backend/filter";
import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

export class GameSession {
    game_id: number;
    channel_id: number;

    constructor(info: { game_id: number; channel_id: number }) {
        const { game_id, channel_id } = info;
        this.game_id = game_id;
        this.channel_id = channel_id;
        console.log("CONSTRUCTOR", game_id, this.game_id);
    }

    broadcast(json_game_event: JsonGameEvent) {
        const game_id = this.game_id;
        const channel_id = this.channel_id;
        serialize({
            channel_id,
            category: "game_events",
            key: game_id.toString(),
            content_label: "lynrummy-event",
            value: json_game_event,
            message_callback: (_message) => {},
        });
    }

    get_events(): JsonGameEvent[] {
        return deserialize_game_events(this.game_id);
    }
}

function get_topic_id_for_game(game_id: number): number | undefined {
    const channel_id = model.channel_id_for("Lyn Rummy");
    if (channel_id === undefined) {
        console.log("could not find stream");
        return undefined;
    }

    const topic_name = `__game_events_${game_id}__`;
    return DB.topic_map.get_topic_id(channel_id, topic_name);
}

function deserialize_game_events(game_id: number): JsonGameEvent[] {
    const topic_id = get_topic_id_for_game(game_id);

    if (topic_id === undefined) {
        return [];
    }

    console.log("deserialize topic_id", topic_id);

    const filter = topic_filter(topic_id);
    const messages = model.filtered_messages(filter);

    messages.sort((m1, m2) => m1.id - m2.id);

    const json_events = [];
    const parser = new DOMParser();

    for (const message of messages) {
        const doc = parser.parseFromString(message.content, "text/html");

        const div = doc.querySelector("div.codehilite");
        if (
            div &&
            div.getAttribute("data-code-language") === "lynrummy-event"
        ) {
            const pre = div.querySelector("pre");
            if (pre) {
                const json_event = JSON.parse(pre.innerText);
                json_events.push(json_event);
            }
        }
    }

    return json_events;
}

export function serialize(info: {
    channel_id: number;
    category: string;
    key: string;
    content_label: string;
    value: object;
    message_callback: MessageCallback;
}): void {
    const {
        channel_id,
        category,
        key,
        content_label,
        value,
        message_callback,
    } = info;

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

type RowType = {
    message: Message;
    value_string: string;
};

export function get_most_recent_row_for_category(info: {
    channel_id: number;
    category: string;
    key: string;
    content_label: string;
}): RowType | undefined {
    const { channel_id, category, key, content_label } = info;

    const topic_name = `__${category}_${key}__`;

    const topic_id = DB.topic_map.get_topic_id(channel_id, topic_name);

    const filter = topic_filter(topic_id);
    const messages = model.filtered_messages(filter);

    if (messages.length === 0) {
        return undefined;
    }

    const message = messages[messages.length - 1];

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
