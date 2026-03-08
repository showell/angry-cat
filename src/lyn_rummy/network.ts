import type { JsonCard, JsonGameEvent } from "./game";
import type { Message } from "../backend/db_types";
import type { MessageCallback } from "../backend/zulip_client";

import { DB } from "../backend/database";
import { topic_filter } from "../backend/filter";
import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

export class GameSession {
    game_id: number;

    constructor(game_id: number) {
        this.game_id = game_id;
        console.log("CONSTRUCTOR", game_id, this.game_id);
    }

    broadcast(json_game_event: JsonGameEvent) {
        serialize_game_event(this.game_id, json_game_event);
    }

    get_events(): JsonGameEvent[] {
        return deserialize_game_events(this.game_id);
    }
}

function serialize_game_event(game_id: number, json_game_event: JsonGameEvent) {
    const stream_id = model.channel_id_for("Lyn Rummy");
    if (stream_id === undefined) {
        console.log("could not find stream");
        return undefined;
    }

    const topic_name = `__game_events_${game_id}__`;
    const json = JSON.stringify(json_game_event);
    const content = `~~~ lynrummy-event\n${json}`;

    zulip_client.send_message({
        stream_id,
        topic_name,
        content,
    }, () => {});
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

export function serialize_cards(json_cards: JsonCard[], message_callback: MessageCallback): void {
    const stream_id = model.channel_id_for("Lyn Rummy");
    if (stream_id === undefined) {
        console.log("could not find stream");
        return undefined;
    }

    const topic_name = "__game_transport__";
    const json = JSON.stringify(json_cards);
    const content = `~~~ lynrummy-cards\n${json}`;

    const local_id = zulip_client.send_message({
        stream_id,
        topic_name,
        content,
    }, message_callback);
}

export function deserialize_cards(content: string): JsonCard[] | undefined {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    const div = doc.querySelector("div.codehilite");
    if (div && div.getAttribute("data-code-language") === "lynrummy-cards") {
        const pre = div.querySelector("pre");
        if (pre) {
            return JSON.parse(pre.innerText);
        }
    }
    return undefined;
}

export function find_last_game_message(): Message | undefined {
    const channel_id = model.channel_id_for("Lyn Rummy");
    if (channel_id === undefined) {
        console.log("could not find channel");
        return undefined;
    }

    const topic_name = "__game_transport__";

    const topic_id = DB.topic_map.get_topic_id(channel_id, topic_name);

    const filter = topic_filter(topic_id);
    const messages = model.filtered_messages(filter);

    if (messages.length === 0) {
        return undefined;
    }

    return messages[messages.length - 1];
}
