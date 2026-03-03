import type { ZulipEvent } from "../backend/event";
import type { PluginHelper } from "../plugin_helper";

import * as lyn_rummy from "./game";
import * as network from "./network";

export function new_game_maker() {
    function maker(plugin_helper: PluginHelper) {
        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((deck_card) => {
            return deck_card.toJSON();
        });

        console.log("serialize cards");
        network.serialize_cards(json_cards);

        return plugin(plugin_helper, json_cards);
    }
    return maker;
}

function plugin(plugin_helper: PluginHelper, json_cards: lyn_rummy.JsonCard[]) {
    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);

    const div = document.createElement("div");
    const max_height = document.documentElement.clientHeight - 60;
    div.style.maxHeight = `${max_height}px`;

    lyn_rummy.run_game_code(deck_cards, div);
    plugin_helper.update_label(lyn_rummy.get_title());

    function handle_event(_event: ZulipEvent) {}

    return {
        div,
        handle_event,
    };
}
