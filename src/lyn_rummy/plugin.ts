import type { ZulipEvent } from "../backend/event";
import type { PluginHelper } from "../plugin_helper";

import { EventFlavor } from "../backend/event";

import * as lyn_rummy from "./game";
import * as network from "./network";

export function new_game_maker() {
    function maker(plugin_helper: PluginHelper) {
        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((deck_card) => {
            return deck_card.toJSON();
        });

        const local_id = network.serialize_cards(json_cards);

        return plugin(plugin_helper, local_id);
    }
    return maker;
}

function plugin(plugin_helper: PluginHelper, local_id: string | undefined) {
    const div = document.createElement("div");
    const max_height = document.documentElement.clientHeight - 60;
    div.style.maxHeight = `${max_height}px`;
    div.innerText = "waiting on server";

    if (local_id === undefined) {
        console.log("must not have found a transport channel");
        div.innerText = "Your admin needs to create a Lyn Rummy channel";
    }

    plugin_helper.update_label(lyn_rummy.get_title());

    function handle_event(event: ZulipEvent) {
        if (event.flavor === EventFlavor.MESSAGE) {
            const local_message_id = event.message.local_message_id;

            if (local_message_id && local_message_id === local_id) {
                const json_cards = network.deserialize_cards(
                    event.message.content,
                );

                if (json_cards) {
                    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);
                    div.innerText = "";
                    lyn_rummy.run_game_code(deck_cards, div);
                }
            }
        }
    }

    return {
        div,
        handle_event,
    };
}
