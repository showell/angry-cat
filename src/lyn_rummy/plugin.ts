import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import type { PluginHelper } from "../plugin_helper";

import { Button } from "../button";
import { MessageRow } from "../row_types";
import type { JsonCard, JsonGameEvent } from "./game";

import * as lyn_rummy from "./game";
import * as model from "../backend/model";
import * as network from "./network";

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

    const button = new Button("Launch new game", 150, () => {
        div.innerHTML = "";
        div.innerText = "waiting on server";
        new GameLauncher(div);
    });

    landing_div.append(button.div);
    div.append(landing_div);

    new GameFinder(div, landing_div);

    function handle_event(_event: ZulipEvent) {}

    return {
        div,
        handle_event,
    };
}

class GameLauncher {
    game_id: number | undefined;
    div: HTMLDivElement;

    constructor(div: HTMLDivElement) {
        const self = this;
        this.div = div;

        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((deck_card) => {
            return deck_card.toJSON();
        });

        const channel_id = model.channel_id_for("Lyn Rummy");
        if (channel_id === undefined) {
            console.log("could not find stream");
            return;
        }

        network.serialize({
            channel_id,
            category: "games",
            key: "*",
            content_label: "lynrummy-cards",
            value: json_cards,
            message_callback,
        });

        function message_callback(message: Message) {
            if (self.game_id) return;

            div.innerHTML = "";
            self.game_id = message.id;
            const is_spectator = false;
            start_new_game(self.game_id, json_cards, div, is_spectator);
        }
    }
}

function start_new_game(
    game_id: number,
    json_cards: JsonCard[],
    div: HTMLDivElement,
    is_spectator: boolean,
) {
    const game_session = new network.GameSession(game_id);

    function broadcast(json_game_event: JsonGameEvent) {
        game_session.broadcast(json_game_event);
    }

    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);
    lyn_rummy.start_game(deck_cards, div, broadcast);

    if (is_spectator) {
        const json_events = game_session.get_events();
        console.log("json_events", json_events);
    }
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
                const is_spectator = true;
                start_new_game(game_id, json_cards, div, is_spectator);
            },
        );

        landing_div.append(button.div);
    }
}
