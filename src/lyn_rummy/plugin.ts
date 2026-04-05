import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import * as model from "../backend/model";
import { NetworkHelper } from "../backend/network";
import { Button } from "../button";
import { MessageRow } from "../message_row";
import type { PluginHelper } from "../plugin_helper";
import type { JsonCard } from "./game";
import * as lyn_rummy from "./game";
import { GameHelper } from "./game_helper";

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

    const channel_id = model.channel_id_for("Lyn Rummy");
    if (channel_id === undefined) {
        console.log("could not find stream");
        div.innerText = "Your admin needs to create a Lyn Rummy channel.";
        return { div };
    }

    const network_helper = new NetworkHelper(channel_id);

    plugin_helper.set_zulip_event_listener((zulip_event: ZulipEvent) => {
        network_helper.handle_zulip_event(zulip_event);
    });

    const button = new Button("Launch new game", 150, () => {
        div.innerHTML = "";
        div.innerText = "waiting on server";
        new GameLauncher(network_helper, div);
    });

    landing_div.append(button.div);
    div.append(landing_div);

    new GameFinder(network_helper, div, landing_div);

    return { div };
}

class GameLauncher {
    game_id: number | undefined;
    div: HTMLDivElement;

    constructor(network_helper: NetworkHelper, div: HTMLDivElement) {
        const self = this;
        this.div = div;

        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((deck_card) => {
            return deck_card.toJSON();
        });

        network_helper.serialize({
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
            start_new_game(
                network_helper,
                self.game_id,
                json_cards,
                div,
                model.current_user_name(),
                is_spectator,
            );
        }
    }
}

function start_new_game(
    network_helper: NetworkHelper,
    game_id: number,
    json_cards: JsonCard[],
    div: HTMLDivElement,
    player1_name: string,
    is_spectator: boolean,
): void {
    const game_helper = new GameHelper({ game_id, network_helper });
    const event_rows = is_spectator ? game_helper.get_events() : [];
    const webxdc = game_helper.xdc_interface();

    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);

    const player2_name = "Player Two";
    lyn_rummy.start_game(
        deck_cards,
        div,
        webxdc,
        event_rows,
        player1_name,
        player2_name,
    );
}

class GameFinder {
    div: HTMLDivElement;
    landing_div: HTMLDivElement;

    constructor(
        network_helper: NetworkHelper,
        div: HTMLDivElement,
        landing_div: HTMLDivElement,
    ) {
        this.div = div;
        this.landing_div = landing_div;

        const row = network_helper.get_most_recent_row_for_category({
            category: "games",
            key: "*",
            content_label: "lynrummy-cards",
        });

        if (row) {
            const message = row.message;
            const game_id = message.id;
            const json_cards = JSON.parse(row.json_string);

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
                    start_new_game(
                        network_helper,
                        game_id,
                        json_cards,
                        div,
                        message_row.sender_name(),
                        is_spectator,
                    );
                },
            );

            landing_div.append(button.div);
        }
    }
}
