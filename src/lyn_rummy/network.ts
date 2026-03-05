import type { JsonCard, JsonGameEvent } from "./game";

import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

export class GameSession {
    game_id: number;

    constructor(game_id: number) {
        this.game_id = game_id;
        console.log("CONSTRUCTOR", game_id, this.game_id);
    }

    broadcast(json_game_event: JsonGameEvent) {
        console.log("pass game_id", this.game_id);
        serialize_game_event(this.game_id, json_game_event);
    }
}

function serialize_game_event(game_id: number, json_game_event: JsonGameEvent) {
    const stream_id = model.channel_id_for("Lyn Rummy");
    if (stream_id === undefined) {
        console.log("could not find stream");
        return undefined;
    }

    console.log("game_id in serialize", game_id);

    const topic_name = `__game_events_${game_id}__`;
    const json = JSON.stringify(json_game_event);
    const content = `~~~ lynrummy-event\n${json}`;

    zulip_client.send_message({
        stream_id,
        topic_name,
        content,
    });
}


export function serialize_cards(json_cards: JsonCard[]): string | undefined {
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
    });

    return local_id;
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
