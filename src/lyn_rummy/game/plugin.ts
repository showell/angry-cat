import type { Message } from "../../backend/db_types";
import type { ZulipEvent } from "../../backend/event";
import * as model from "../../backend/model";
import { is_gopher_realm } from "../../backend/config";
import { DB } from "../../backend/database";
import { NetworkHelper } from "../../backend/network";
import { Button } from "../../button";
import { MessageRow } from "../../backend/message_row";
import type { Plugin, PluginContext } from "../../plugin_helper";
import type { JsonCard, GameSetup } from "./game";
import * as lyn_rummy from "./game";
import { GameHelper } from "./game_helper";
import {
    GopherGameHelper,
    create_gopher_game,
    create_gopher_puzzle_game,
    list_gopher_games,
    join_gopher_game,
    delete_gopher_game,
    type GopherGameInfo,
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
    const lobby_div = document.createElement("div");
    lobby_div.style.paddingTop = "20px";
    lobby_div.style.display = "flex";
    lobby_div.style.flexDirection = "column";
    lobby_div.style.alignItems = "center";
    lobby_div.style.gap = "6px";
    lobby_div.style.maxWidth = "500px";
    lobby_div.style.margin = "0 auto";

    // --- Section: Start a new game ---
    add_section_header(lobby_div, "Start a new game");
    const launch_row = document.createElement("div");
    launch_row.style.display = "flex";
    launch_row.style.gap = "10px";

    const solitaire_button = new Button("Solitaire", 140, async () => {
        console.log("[lynrummy] Starting solitaire game");
        div.innerHTML = "";
        div.innerText = "Dealing...";
        const deck_cards = lyn_rummy.build_full_double_deck();
        const setup = lyn_rummy.Dealer.deal_full_game(deck_cards);
        const webxdc = {
            selfAddr: "solitaire",
            sendUpdate(_update: any) {},
            setUpdateListener(_callback: any) {},
        };
        div.innerHTML = "";
        lyn_rummy.start_game_from_setup(
            setup, div, webxdc, [],
            model.current_user_name(), "Player Two",
        );
    });

    const open_button = new Button("Open game", 140, async () => {
        console.log("[lynrummy] Starting open game");
        div.innerHTML = "";
        div.innerText = "Creating game...";
        const deck_cards = lyn_rummy.build_full_double_deck();
        const json_deck = deck_cards.map(c => c.toJSON());
        const { game_id, game_setup } = await create_gopher_game(json_deck);
        const helper = new GopherGameHelper({ game_id, user_id: DB.current_user_id });
        div.innerHTML = "";
        gopher_start_game_from_setup(helper, game_setup, div);
    });

    launch_row.append(solitaire_button.div);
    launch_row.append(open_button.div);
    lobby_div.append(launch_row);

    // Populate the sections.
    populate_lobby(lobby_div, div);

    div.append(lobby_div);

    return { div };
}

function add_section_header(parent: HTMLElement, text: string): void {
    const h = document.createElement("h3");
    h.innerText = text;
    h.style.margin = "16px 0 4px 0";
    h.style.color = "#000080";
    h.style.fontSize = "14px";
    h.style.alignSelf = "flex-start";
    parent.append(h);
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

    // Group games by type.
    const puzzles: GopherGameInfo[] = [];
    const my_games: GopherGameInfo[] = [];
    const open_games: GopherGameInfo[] = [];

    for (const game of games) {
        const is_puzzle = game.puzzle_name !== null;
        const is_my_game = game.player1_id === user_id || game.player2_id === user_id;
        const is_open = game.player2_id === null;

        if (is_puzzle) {
            puzzles.push(game);
        } else if (is_my_game) {
            my_games.push(game);
        } else if (is_open) {
            open_games.push(game);
        }
    }

    // --- Puzzles section ---
    if (puzzles.length > 0) {
        add_section_header(lobby_div, `Puzzles (${puzzles.length})`);
        for (const game of puzzles) {
            const is_my_puzzle = game.player1_id === user_id || game.player2_id === user_id;
            const is_open = game.player2_id === null;
            const row = make_game_row(
                game.puzzle_name!,
                async () => {
                    if (is_open && !is_my_puzzle) {
                        const ok = await join_gopher_game(game.id);
                        if (!ok) return;
                    }
                    div.innerHTML = "";
                    div.innerText = "Loading puzzle...";
                    await gopher_resume_puzzle_game(game.id, div);
                },
                async () => { await delete_gopher_game(game.id); },
            );
            lobby_div.append(row);
        }
    }

    // --- My games section ---
    if (my_games.length > 0) {
        add_section_header(lobby_div, `My games (${my_games.length})`);
        for (const game of my_games) {
            const row = make_game_row(
                `Game ${game.id} (${game.event_count} events)`,
                async () => {
                    div.innerHTML = "";
                    div.innerText = "Loading game...";
                    await gopher_resume_game(game.id, div);
                },
                async () => { await delete_gopher_game(game.id); },
            );
            lobby_div.append(row);
        }
    }

    // --- Open games section ---
    if (open_games.length > 0) {
        add_section_header(lobby_div, `Open games (${open_games.length})`);
        for (const game of open_games) {
            const row = make_game_row(
                `Join game ${game.id}`,
                async () => {
                    const ok = await join_gopher_game(game.id);
                    if (!ok) return;
                    div.innerHTML = "";
                    div.innerText = "Loading game...";
                    await gopher_resume_game(game.id, div);
                },
                null, // can't delete someone else's game
            );
            lobby_div.append(row);
        }
    }
}

function make_game_row(
    label: string,
    on_play: () => Promise<void>,
    on_delete: (() => Promise<void>) | null,
): HTMLDivElement {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.alignItems = "center";

    const play = new Button(label, 300, on_play);
    row.append(play.div);

    if (on_delete) {
        const del = new Button("\u2716", 36, async () => {
            await on_delete();
            row.remove();
        });
        del.div.title = "Delete";
        row.append(del.div);
    }

    return row;
}

// Start a new game from a setup snapshot.
function gopher_start_game_from_setup(
    helper: GopherGameHelper,
    setup: GameSetup,
    div: HTMLDivElement,
): void {
    const webxdc = helper.xdc_interface();
    lyn_rummy.start_game_from_setup(
        setup,
        div,
        webxdc,
        [],
        model.current_user_name(),
        "Player Two",
    );
}

// Resume or join a game — fetch the setup from the server.
async function gopher_resume_game(
    game_id: number,
    div: HTMLDivElement,
): Promise<void> {
    const user_id = DB.current_user_id;
    const helper = new GopherGameHelper({ game_id, user_id });

    const setup = await helper.get_setup();
    if (!setup) {
        div.innerText = "Could not load game setup.";
        return;
    }

    const webxdc = helper.xdc_interface();
    const event_rows = await helper.get_events_after(helper.last_seen_event_id);

    div.innerHTML = "";
    lyn_rummy.start_game_from_setup(
        setup,
        div,
        webxdc,
        event_rows,
        model.current_user_name(),
        "Player Two",
    );
}

// Resume or join a puzzle game. Mirrors gopher_resume_game but
// pulls a puzzle_setup snapshot from the first event instead of
// a deck. start_game gets an empty deck and the snapshot, which
// it uses to override initial_board() / deal_cards().
async function gopher_resume_puzzle_game(
    game_id: number,
    div: HTMLDivElement,
): Promise<void> {
    const user_id = DB.current_user_id;
    const helper = new GopherGameHelper({ game_id, user_id });

    const puzzle_setup = await helper.get_puzzle_setup();
    if (!puzzle_setup) {
        div.innerText = "Could not load puzzle setup.";
        return;
    }

    const webxdc = helper.xdc_interface();
    const event_rows = await helper.get_events_after(helper.last_seen_event_id);

    // Clear the "Loading puzzle..." placeholder before start_game
    // appends the game UI.
    div.innerHTML = "";
    lyn_rummy.start_game(
        [],
        div,
        webxdc,
        event_rows,
        model.current_user_name(),
        "Player Two",
        puzzle_setup,
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
