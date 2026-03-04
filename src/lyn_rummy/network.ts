import type { JsonCard } from "./game";

import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

export function serialize_cards(json_cards: JsonCard[]): string | undefined {
    const stream_id = model.channel_id_for("Lyn Rummy");
    if (stream_id ===  undefined) {
        console.log("could not find stream");
        return undefined;
    }

    const topic_name = "__game_transport__";
    const json = JSON.stringify(json_cards);
    const content = `~~~ lynrummy-cards\n${json}`;

    const local_id = zulip_client.send_message({ stream_id, topic_name, content });

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
