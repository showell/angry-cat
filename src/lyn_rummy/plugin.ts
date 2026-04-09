import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import * as model from "../backend/model";
import { is_gopher_realm } from "../backend/config";
import { DB } from "../backend/database";
import { NetworkHelper } from "../backend/network";
import { Button } from "../button";
import { MessageRow } from "../backend/message_row";
import type { Plugin, PluginContext } from "../plugin_helper";
import type { JsonCard } from "./game";
import * as lyn_rummy from "./game";
import { GameHelper } from "./game_helper";
import {
    GopherGameHelper,
    create_gopher_game,
    list_gopher_games,
    join_gopher_game,
} from "./gopher_game_helper";

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");
    const max_height = document.documentElement.clientHeight - 60;
    div.style.maxHeight = `${max_height}px`;
    div.style.marginTop = "10px";

    context.update_label(lyn_rummy.get_title());

    if (is_gopher_realm()) {
        return gopher_plugin(div);
    }

    return zulip_plugin(div, context);
}

// --- Gopher path: game bus via /gopher/games endpoints ---

function gopher_plugin(div: HTMLDivElement): Plugin {
    // The lobby is the landing area shown before the player picks
    // a game. It holds a "Launch new game" button and one button
    // per existing game (to resume or join). Puzzle games appear
    // in the same lobby with their own labels.
    const lobby_div = document.createElement("div");
    lobby_div.style.paddingTop = "30px";
    lobby_div.style.display = "flex";
    lobby_div.style.justifyContent = "center";
    lobby_div.style.gap = "20px";

    const launch_button = new Button("Launch new game", 150, async () => {
        div.innerHTML = "";
        div.innerText = "Creating game...";
        const game_id = await create_gopher_game();
        // Store the shuffled deck as the first event so the other
        // player gets the same deal.
        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_cards = deck_cards.map((c) => c.toJSON());
        const helper = new GopherGameHelper({ game_id, user_id: DB.current_user_id });
        await helper.post_deck(json_cards);
        div.innerHTML = "";
        gopher_start_game_with_helper(helper, json_cards, div);
    });

    lobby_div.append(launch_button.div);

    // Populate the lobby with existing games we can resume or join.
    populate_lobby(lobby_div, div);

    div.append(lobby_div);

    return { div };
}

// Fetch the existing games and add a button to the lobby for each
// one the current user can act on (resume their own, join an open
// game, or play a puzzle). Puzzle games carry a non-null
// puzzle_name from the server and get a "Play puzzle" label
// regardless of who created them.
async function populate_lobby(
    lobby_div: HTMLDivElement,
    div: HTMLDivElement,
): Promise<void> {
    const user_id = DB.current_user_id;
    const games = await list_gopher_games();

    for (const game of games) {
        const is_puzzle = game.puzzle_name !== null;
        const is_my_game = game.player1_id === user_id || game.player2_id === user_id;
        const is_open = game.player2_id === null;

        if (is_puzzle) {
            // Puzzles share the lobby with regular games but use
            // a distinct label. Click behavior is the same as a
            // resume/join — we just relabel the button.
            const label = `Play puzzle: ${game.puzzle_name}`;
            const button = new Button(label, 200, async () => {
                if (is_open && !is_my_game) {
                    const ok = await join_gopher_game(game.id);
                    if (!ok) return;
                }
                div.innerHTML = "";
                div.innerText = "Loading puzzle...";
                await gopher_resume_game(game.id, div);
            });
            lobby_div.append(button.div);
            continue;
        }

        if (is_my_game) {
            const label = `Resume game ${game.id} (${game.event_count} events)`;
            const button = new Button(label, 200, async () => {
                div.innerHTML = "";
                div.innerText = "Loading game...";
                await gopher_resume_game(game.id, div);
            });
            lobby_div.append(button.div);
        } else if (is_open) {
            const label = `Join game ${game.id}`;
            const button = new Button(label, 150, async () => {
                const ok = await join_gopher_game(game.id);
                if (!ok) return;
                div.innerHTML = "";
                div.innerText = "Loading game...";
                await gopher_resume_game(game.id, div);
            });
            lobby_div.append(button.div);
        }
    }
}

// Start a new game with a known deck and an already-initialized helper
// (which has last_seen_event_id set from posting the deck).
function gopher_start_game_with_helper(
    helper: GopherGameHelper,
    json_cards: JsonCard[],
    div: HTMLDivElement,
): void {
    const webxdc = helper.xdc_interface();
    const deck_cards = json_cards.map(lyn_rummy.Card.from_json);

    lyn_rummy.start_game(
        deck_cards,
        div,
        webxdc,
        [],
        model.current_user_name(),
        "Player Two",
    );
}

// Resume or join a game — fetch the deck from the server.
async function gopher_resume_game(
    game_id: number,
    div: HTMLDivElement,
): Promise<void> {
    const user_id = DB.current_user_id;
    const helper = new GopherGameHelper({ game_id, user_id });

    const json_cards = await helper.get_deck();
    if (!json_cards) {
        div.innerText = "Could not load game deck.";
        return;
    }

    const webxdc = helper.xdc_interface();
    const deck_cards = (json_cards as JsonCard[]).map(lyn_rummy.Card.from_json);

    // Fetch all game events after the deck event for replay.
    // get_deck() already set last_seen_event_id to the deck event's ID.
    const event_rows = await helper.get_events_after(helper.last_seen_event_id);

    lyn_rummy.start_game(
        deck_cards,
        div,
        webxdc,
        event_rows,
        model.current_user_name(),
        "Player Two",
    );
}

// --- Zulip path: original channel-based game bus ---

function zulip_plugin(div: HTMLDivElement, context: PluginContext): Plugin {
    const landing_div = document.createElement("div");
    landing_div.style.paddingTop = "30px";
    landing_div.style.display = "flex";
    landing_div.style.justifyContent = "center";

    const channel_id = model.channel_id_for("Lyn Rummy");
    if (channel_id === undefined) {
        console.log("could not find stream");
        div.innerText = "Your admin needs to create a Lyn Rummy channel.";
        return { div };
    }

    const network_helper = new NetworkHelper(channel_id);

    const handle_zulip_event = (zulip_event: ZulipEvent) => {
        network_helper.handle_zulip_event(zulip_event);
    };

    const button = new Button("Launch new game", 150, () => {
        div.innerHTML = "";
        div.innerText = "waiting on server";
        new GameLauncher(network_helper, div);
    });

    landing_div.append(button.div);
    div.append(landing_div);

    new GameFinder(network_helper, div, landing_div);

    return { div, handle_zulip_event };
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
            start_zulip_game(
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

function start_zulip_game(
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
                    start_zulip_game(
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
