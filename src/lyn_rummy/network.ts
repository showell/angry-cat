import type { JsonCard } from "./game";

import * as model from "../backend/model";
import * as zulip_client from "../backend/zulip_client";

export function serialize_cards(json_cards: JsonCard[])  {

    const stream_id = model.channel_id_for("Lyn Rummy");
    if (stream_id ===  undefined) {
        console.log("could not find stream");
        return;
    }

    const topic_name = "__game_transport__";
    const json = JSON.stringify(json_cards);
    const content = `~~~\n${json}`;

    const local_id = zulip_client.send_message({ stream_id, topic_name, content });

    console.log("local_id", local_id);
}
