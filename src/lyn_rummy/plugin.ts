import type { ZulipEvent } from "../backend/event";
import type { PluginHelper } from "../plugin_helper";

import { EventFlavor } from "../backend/event";

import type { JsonCard, JsonGameEvent } from "./game";

import * as lyn_rummy from "./game";
import * as network from "./network";

type GameStart = {
    game_id: number;
    json_cards: JsonCard[];
};

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

    plugin_helper.update_label(lyn_rummy.get_title());

    if (local_id === undefined) {
        console.log("must not have found a transport channel");
        div.innerText = "Your admin needs to create a Lyn Rummy channel";
        return { div, handle_event: (_event: ZulipEvent) => {} };
    }

    const game_local_id: string = local_id;

    let game_id: number | undefined;

    function handle_event(event: ZulipEvent) {
        if (game_id) return;

        const game_start = get_game_start(event, game_local_id);
        if (game_start) {
            game_id = game_start.game_id;
            div.innerText = "";
            start_new_game(game_id, game_start.json_cards, div);
        }
    }

    return {
        div,
        handle_event,
    };
}

function get_game_start(event: ZulipEvent, local_id: string): GameStart | undefined {
    if (event.flavor === EventFlavor.MESSAGE) {
        const local_message_id = event.message.local_message_id;

        if (local_message_id && local_message_id === local_id) {
            const game_id = event.message.id;

            const json_cards = network.deserialize_cards(
                event.message.content,
            );

            if (json_cards) {
                return {
                    game_id,
                    json_cards,
                };
            }
        }
    }
    return undefined;
}

function start_new_game(game_id: number, json_cards: JsonCard[], div: HTMLDivElement) {
    const game_session = new network.GameSession(game_id);

    function broadcast(json_game_event: JsonGameEvent) {
        game_session.broadcast(json_game_event);
    }

    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);
    lyn_rummy.start_game(deck_cards, div, broadcast);
}
