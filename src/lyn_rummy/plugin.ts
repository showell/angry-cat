import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import type { PluginHelper } from "../plugin_helper";

import { Button } from "../button";
import { MessageRow } from "../row_types";
import { EventFlavor } from "../backend/event";

import type { JsonCard, JsonGameEvent } from "./game";

import * as lyn_rummy from "./game";
import * as network from "./network";

type GameStart = {
    game_id: number;
    json_cards: JsonCard[];
};

export function plugin(plugin_helper: PluginHelper) {
    const div = document.createElement("div");
    const max_height = document.documentElement.clientHeight - 60;
    div.style.maxHeight = `${max_height}px`;
    div.style.marginTop = "10px";

    const landing_div = document.createElement("div");
    landing_div.style.paddingTop = "30px";
    landing_div.style.display = "flex";
    landing_div.style.justifyContent = "center";

    plugin_helper.update_label(lyn_rummy.get_title());

    let game_launcher: GameLauncher;

    const button = new Button("Launch new game", 150, () => {
        div.innerHTML = "";
        div.innerText = "waiting on server";
        game_launcher = new GameLauncher(div);
    });

    landing_div.append(button.div);
    div.append(landing_div);

    new GameFinder(div, landing_div);

    function handle_event(event: ZulipEvent) {
        if (game_launcher) {
            game_launcher.handle_event(event);
        }
    }

    return {
        div,
        handle_event,
    };
}

class GameLauncher {
    local_id: string | undefined;
    game_id: number | undefined;
    div: HTMLDivElement;

    constructor(div: HTMLDivElement) {
        this.div = div;

        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((deck_card) => {
            return deck_card.toJSON();
        });

        const local_id = network.serialize_cards(json_cards);

        if (local_id === undefined) {
            console.log("must not have found a transport channel");
            div.innerText = "Your admin needs to create a Lyn Rummy channel";
        }

        this.local_id = local_id;
    }

    handle_event(event: ZulipEvent) {
        const div = this.div;
        const game_local_id = this.local_id;

        if (!game_local_id) return;

        if (this.game_id) return;

        const game_start = get_game_start(event, game_local_id);
        if (game_start) {
            this.game_id = game_start.game_id;
            div.innerHTML = "";
            start_new_game(this.game_id, game_start.json_cards, div);
        }
    }
}

function get_game_start(
    event: ZulipEvent,
    local_id: string,
): GameStart | undefined {
    if (event.flavor === EventFlavor.MESSAGE) {
        const local_message_id = event.message.local_message_id;

        if (local_message_id && local_message_id === local_id) {
            const game_id = event.message.id;

            const json_cards = network.deserialize_cards(event.message.content);

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

function start_new_game(
    game_id: number,
    json_cards: JsonCard[],
    div: HTMLDivElement,
) {
    const game_session = new network.GameSession(game_id);

    function broadcast(json_game_event: JsonGameEvent) {
        game_session.broadcast(json_game_event);
    }

    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);
    lyn_rummy.start_game(deck_cards, div, broadcast);
}

class GameFinder {
    div: HTMLDivElement;
    landing_div: HTMLDivElement;

    constructor(div: HTMLDivElement, landing_div: HTMLDivElement) {
        this.div = div;
        this.landing_div = landing_div;

        const message = network.find_last_game_message();
        if (message) {
            this.add_game_from_message(message);
        }
    }

    add_game_from_message(message: Message) {
        const div = this.div;
        const landing_div = this.landing_div;
        const game_id = message.id;
        const json_cards = network.deserialize_cards(message.content);

        if (json_cards === undefined) {
            console.log("UNEXPECTED lack of cards");
            return;
        }

        const message_row = new MessageRow(message);

        const button = new Button(
            `Play ${message_row.sender_name()}`,
            150,
            () => {
                div.innerHTML = "";
                start_new_game(game_id, json_cards, div);
            },
        );

        landing_div.append(button.div);
    }
}
