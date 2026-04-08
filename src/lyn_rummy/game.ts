import type { Update, UpdateListener, WebXdc } from "../backend/webxdc";
import {
    all_suits,
    build_full_double_deck,
    type Card,
    CardColor,
    type JsonCard,
    OriginDeck,
    Suit,
    suit_emoji_str,
    value_str,
} from "./card";

export type { JsonCard } from "./card";
export { build_full_double_deck, Card } from "./card";

import {
    type BoardCard,
    BoardCardState,
    type BoardLocation,
    CARD_WIDTH,
    CardStack,
    HandCard,
    HandCardState,
    type JsonBoardCard,
    type JsonCardStack,
    type JsonHandCard,
} from "./card_stack";

export type {
    JsonBoardCard,
    JsonCardStack,
    JsonHandCard,
} from "./card_stack";
export { CardStack } from "./card_stack";

import { get_hint, HintLevel } from "./hints";
import { CompleteTurnResult, PlayerTurn } from "./player_turn";
import { Score } from "./score";

enum GameEventType {
    ADVANCE_TURN,
    MAYBE_COMPLETE_TURN,
    PLAYER_ACTION,
    UNDO,
}

export type JsonBoardEvent = {
    stacks_to_remove: JsonCardStack[];
    stacks_to_add: JsonCardStack[];
};

export type JsonPlayerAction = {
    board_event: BoardEvent;
    hand_cards_to_release: JsonHandCard[];
};

export type JsonGameEvent = {
    type: GameEventType;
    player_action: JsonPlayerAction | undefined;
};

export type EventRow = {
    json_game_event: JsonGameEvent;
    addr: string;
};

function get_sorted_cards_for_suit(
    suit: Suit,
    hand_cards: HandCard[],
): HandCard[] {
    const suit_cards: HandCard[] = [];
    for (const hand_card of hand_cards) {
        if (hand_card.card.suit === suit) {
            suit_cards.push(hand_card);
        }
    }
    suit_cards.sort(
        (hand_card1, hand_card2) =>
            hand_card1.card.value - hand_card2.card.value,
    );
    return suit_cards;
}

let CurrentBoard: Board;

class Board {
    card_stacks: CardStack[];

    constructor(card_stacks: CardStack[]) {
        this.card_stacks = card_stacks;
    }

    clone(): Board {
        return new Board(
            this.card_stacks.map((card_stack) => card_stack.clone()),
        );
    }

    str(): string {
        const card_stacks = this.card_stacks;

        if (card_stacks.length === 0) {
            return "(empty)";
        }

        return card_stacks.map((card_stack) => card_stack.str()).join(" | ");
    }

    process_event(board_event: BoardEvent): void {
        const { stacks_to_remove, stacks_to_add } = board_event;

        function need_to_remove(stack: CardStack) {
            for (const remove_stack of stacks_to_remove) {
                if (stack.equals(remove_stack)) {
                    return true;
                }
            }
            return false;
        }

        const new_stacks = [];

        for (const card_stack of this.card_stacks) {
            if (!need_to_remove(card_stack)) {
                new_stacks.push(card_stack);
            }
        }

        for (const stack of stacks_to_add) {
            new_stacks.push(stack);
        }

        this.card_stacks = new_stacks;
    }

    score(): number {
        return Score.for_stacks(this.card_stacks);
    }

    is_clean(): boolean {
        const card_stacks = this.card_stacks;

        for (const card_stack of card_stacks) {
            if (card_stack.incomplete() || card_stack.problematic()) {
                return false;
            }
        }

        return true;
    }

    // This is called after the player's turn ends.
    age_cards(): void {
        this.card_stacks = this.card_stacks.map((card_stack) => {
            return CardStack.aged_from_prior_turn(card_stack);
        });
    }
}

/***********************************************

PLAYER, DECK, ETC. vvvv

***********************************************/

let TheDeck: Deck;

class Deck {
    // The "top" of the deck is the last index, so
    // we can do the equivalent of pop, not that it
    // remotely matters at our scale.
    cards: Card[];

    constructor(cards: Card[]) {
        this.cards = cards;
    }

    clone() {
        return new Deck([...this.cards]);
    }

    str(): string {
        return this.cards.map((card) => card.str()).join(" ");
    }

    size(): number {
        return this.cards.length;
    }

    take_from_top(cnt: number): Card[] {
        const cards = this.cards;
        const offset = cards.length - cnt;
        const top_cards = cards.splice(offset, cnt);
        return top_cards;
    }

    pull_card_from_deck(card: Card): void {
        remove_card_from_array(this.cards, card);
    }
}

function remove_card_from_array(cards: Card[], card: Card): void {
    for (let i = 0; i < cards.length; ++i) {
        if (cards[i].equals(card)) {
            cards.splice(i, 1);
            return;
        }
    }

    throw new Error("Card to be removed is not present in the array!");
}

class Hand {
    hand_cards: HandCard[];

    constructor() {
        this.hand_cards = [];
    }

    is_empty() {
        return this.hand_cards.length === 0;
    }

    add_cards(cards: Card[], state: HandCardState): void {
        for (const card of cards) {
            this.hand_cards.push(new HandCard(card, state));
        }
    }

    remove_card_from_hand(hand_card: HandCard): void {
        const hand_cards = this.hand_cards;

        for (let i = 0; i < hand_cards.length; ++i) {
            if (hand_cards[i].card.equals(hand_card.card)) {
                hand_cards.splice(i, 1);
                return;
            }
        }

        throw new Error("Card to be removed is not present in the array!");
    }

    // This is called after the player's turn ends.
    reset_state(): void {
        for (const hand_card of this.hand_cards) {
            hand_card.state = HandCardState.NORMAL;
        }
    }

    size(): number {
        return this.hand_cards.length;
    }
}

let ActivePlayer: Player;

class Player {
    name: string;
    active: boolean;
    show: boolean;
    hand: Hand;
    num_drawn: number;
    total_score: number;
    total_score_when_turn_started: number;
    player_turn?: PlayerTurn;

    constructor(name: string) {
        this.name = name;
        this.active = false;
        this.show = false;
        this.num_drawn = 0;
        this.hand = new Hand();
        this.total_score = 0;
        this.total_score_when_turn_started = 0;
    }

    get_turn_score(): number {
        assert(this.player_turn !== undefined);
        return this.player_turn.get_score(CurrentBoard.score());
    }

    get_board_delta(): number {
        assert(this.player_turn !== undefined);
        return CurrentBoard.score() - this.player_turn.starting_board_score;
    }

    get_updated_score(): number {
        if (CurrentBoard.is_clean() && this.player_turn && this.active) {
            this.total_score =
                this.total_score_when_turn_started + this.get_turn_score();
        }
        return this.total_score;
    }

    start_turn(): void {
        this.total_score_when_turn_started = this.total_score;
        this.show = true;
        this.active = true;
        this.num_drawn = 0; // only used after end_turn
        this.player_turn = new PlayerTurn(CurrentBoard.score());
    }

    end_turn(): CompleteTurnResult {
        // This sets all the freshly-drawn cards to normal.
        this.hand.reset_state();

        assert(this.player_turn !== undefined);
        const turn_result = this.player_turn.turn_result();

        // Draw cards (if necessary) for our next turn.
        switch (turn_result) {
            case CompleteTurnResult.SUCCESS_BUT_NEEDS_CARDS:
                // Draw cards since the user's current cards don't
                // seem to play to the board. (By the way, this often
                // happens in a two-player game because the
                // **opponent** didn't add any cards to the board.)
                this.take_cards_from_deck(3);
                break;

            case CompleteTurnResult.SUCCESS_AS_VICTOR:
            case CompleteTurnResult.SUCCESS_WITH_HAND_EMPTIED:
                // Draw 5 new cards from deck to continue playing.
                ActivePlayer.take_cards_from_deck(5);
                break;
        }

        // Make sure that the total score is current.
        this.get_updated_score();

        this.active = false;

        return turn_result;
    }

    stop_showing() {
        this.show = false;
    }

    take_card_back(hand_card: HandCard) {
        assert(this.player_turn !== undefined);
        if (this.hand.is_empty()) {
            this.player_turn.revoke_empty_hand_bonuses();
        }

        this.hand.add_cards([hand_card.card], HandCardState.BACK_FROM_BOARD);

        this.player_turn.undo_score_after_move();
    }

    release_card(hand_card: HandCard) {
        // We get called once and only once each time
        // a card is released to the board.
        this.hand.remove_card_from_hand(hand_card);

        // they get a bonus for playing a card
        assert(this.player_turn !== undefined);
        this.player_turn.update_score_after_move();

        // When we empty our hand, we get additional bonuses.
        if (this.hand.is_empty()) {
            this.player_turn.update_score_for_empty_hand(
                TheGame.declares_me_victor(),
            );
        }
    }

    take_cards_from_deck(cnt: number): void {
        const cards = TheDeck.take_from_top(cnt);
        this.num_drawn = cards.length;
        this.hand.add_cards(cards, HandCardState.FRESHLY_DRAWN);
    }

    cards_drawn_for_next_turn(): string {
        return pluralize(this.num_drawn, "more card");
    }

    get_num_cards_played(): number {
        assert(this.player_turn !== undefined);
        return this.player_turn.get_num_cards_played();
    }
}

function initial_board(): Board {
    function stack(row: number, sig: string): CardStack {
        const col = (row * 3 + 1) % 5;
        const loc = { top: 20 + row * 60, left: 40 + col * 30 };
        return CardStack.pull_from_deck(sig, OriginDeck.DECK_ONE, loc, TheDeck);
    }

    const stacks = [
        stack(0, "KS,AS,2S,3S"),
        stack(1, "TD,JD,QD,KD"),
        stack(2, "2H,3H,4H"),
        stack(3, "7S,7D,7C"),
        stack(4, "AC,AD,AH"),
        stack(5, "2C,3D,4C,5H,6S,7H"),
    ];

    return new Board(stacks);
}

let PlayerGroup: PlayerGroupSingleton;

class PlayerGroupSingleton {
    players: Player[];
    current_player_index: number;

    constructor(player_names: string[]) {
        this.players = player_names.map((name) => new Player(name));

        this.deal_cards();
        this.current_player_index = 0;
        ActivePlayer = this.players[0];
    }

    get_player_names(): string[] {
        return this.players.map((player) => player.name);
    }

    deal_cards() {
        for (const player of this.players) {
            const cards = TheDeck.take_from_top(15);
            player.hand.add_cards(cards, HandCardState.NORMAL);
        }
    }

    advance_turn(): void {
        ActivePlayer.stop_showing();
        this.current_player_index =
            (this.current_player_index + 1) % this.players.length;

        ActivePlayer = this.players[this.current_player_index];
        ActivePlayer.start_turn();
    }
}

let TheGame: Game;

class Game {
    has_victor_already: boolean;

    constructor() {
        this.has_victor_already = false;
    }

    declares_me_victor(): boolean {
        // Players only call us if they empty their hand.
        // We only return true for the first player.
        if (this.has_victor_already) {
            return false; // there can only be one winner
        }

        if (!CurrentBoard.is_clean()) {
            return false;
        }

        // We have a winner!
        this.has_victor_already = true;
        return true;
    }

    advance_turn_to_next_player(): void {
        CurrentBoard.age_cards();
        PlayerGroup.advance_turn();
    }

    maybe_complete_turn(): CompleteTurnResult {
        // We return failure so that Angry Cat can complain
        // about the dirty board.
        if (!CurrentBoard.is_clean()) return CompleteTurnResult.FAILURE;

        // Let the player decide all the other conditions.
        const turn_result = ActivePlayer.end_turn();
        return turn_result;
    }

    process_player_action(player_action: PlayerAction): void {
        CurrentBoard.process_event(player_action.board_event);

        for (const hand_card of player_action.hand_cards_to_release) {
            ActivePlayer.release_card(hand_card);
        }
    }

    reverse_player_action(player_action: PlayerAction): void {
        const orig_board_event = player_action.board_event;
        CurrentBoard.process_event(
            new BoardEvent({
                stacks_to_remove: orig_board_event.stacks_to_add,
                stacks_to_add: orig_board_event.stacks_to_remove,
            }),
        );

        for (const hand_card of player_action.hand_cards_to_release) {
            ActivePlayer.take_card_back(hand_card);
        }
    }
}

class BoardEvent {
    stacks_to_remove: CardStack[];
    stacks_to_add: CardStack[];

    constructor(info: {
        stacks_to_remove: CardStack[];
        stacks_to_add: CardStack[];
    }) {
        this.stacks_to_remove = info.stacks_to_remove;
        this.stacks_to_add = info.stacks_to_add;
    }

    toJSON(): JsonBoardEvent {
        return {
            stacks_to_remove: this.stacks_to_remove.map((stack) =>
                stack.toJSON(),
            ),
            stacks_to_add: this.stacks_to_add.map((stack) => stack.toJSON()),
        };
    }

    static from_json(json: JsonBoardEvent): BoardEvent {
        const stacks_to_remove = json.stacks_to_remove.map((stack) => {
            return CardStack.from_json(stack);
        });

        const stacks_to_add = json.stacks_to_add.map((stack) => {
            return CardStack.from_json(stack);
        });

        return new BoardEvent({ stacks_to_remove, stacks_to_add });
    }
}

class PlayerAction {
    // This is just a glorified struct! Callers are allowed
    // to directly reference anything they want, but they should
    // never mutate anything.

    board_event: BoardEvent;
    hand_cards_to_release: HandCard[];

    constructor(info: {
        board_event: BoardEvent;
        hand_cards_to_release: HandCard[];
    }) {
        this.board_event = info.board_event;
        this.hand_cards_to_release = info.hand_cards_to_release;
    }

    toJSON(): JsonPlayerAction {
        return {
            board_event: this.board_event,
            hand_cards_to_release: this.hand_cards_to_release,
        };
    }

    static from_json(json: JsonPlayerAction) {
        const board_event = BoardEvent.from_json(json.board_event);
        const hand_cards_to_release = json.hand_cards_to_release.map(
            (json_hand_card) => HandCard.from_json(json_hand_card),
        );

        return new PlayerAction({ board_event, hand_cards_to_release });
    }

    static board_action(board_event: BoardEvent): PlayerAction {
        return new PlayerAction({
            board_event,
            hand_cards_to_release: [],
        });
    }

    static hand_card_action(info: {
        board_event: BoardEvent;
        hand_cards_to_release: HandCard[];
    }) {
        const { board_event, hand_cards_to_release } = info;

        return new PlayerAction({
            board_event,
            hand_cards_to_release,
        });
    }
}

let GameEventTracker: GameEventTrackerSingleton;

class GameEventTrackerSingleton {
    replay_in_progress: boolean;
    json_game_events: JsonGameEvent[];
    orig_deck: Deck;
    orig_board: Board;
    webxdc: WebXdc;

    constructor(webxdc: WebXdc) {
        this.webxdc = webxdc;
        this.replay_in_progress = false;
        this.json_game_events = [];
        this.orig_deck = TheDeck.clone();
        this.orig_board = CurrentBoard.clone();
    }

    empty() {
        return this.json_game_events.length === 0;
    }

    handle_initial_events(json_game_events: JsonGameEvent[]): void {
        for (const json_game_event of json_game_events) {
            const game_event = GameEvent.from_json(json_game_event);
            this.play_game_event(game_event);
            if (game_event.type !== GameEventType.UNDO) {
                this.json_game_events.push(json_game_event);
            }
        }
    }

    push_event(game_event: GameEvent): void {
        if (!this.replay_in_progress) {
            const json_game_event = game_event.toJSON();
            this.json_game_events.push(json_game_event);
            this.broadcast_game_event(game_event);
        }
    }

    broadcast_game_event(game_event: GameEvent): void {
        const webxdc = this.webxdc;
        const addr = webxdc.selfAddr;
        const json_game_event = game_event.toJSON();
        const event_row = { json_game_event, addr };
        webxdc.sendUpdate({ payload: event_row });
    }

    broadcast_undo_event(): void {
        const game_event = new GameEvent(GameEventType.UNDO);
        this.broadcast_game_event(game_event);
    }

    pop_player_action(): PlayerAction | undefined {
        const json_game_event = this.json_game_events.pop();

        if (json_game_event === undefined) {
            console.error("no events to pop");
            return undefined;
        }

        const game_event = GameEvent.from_json(json_game_event);

        return game_event.player_action;
    }

    handle_event(json_game_event: JsonGameEvent): void {
        const game_event = GameEvent.from_json(json_game_event);
        this.replay_in_progress = true;
        this.play_game_event(game_event);
        this.replay_in_progress = false;
    }

    play_game_event(game_event: GameEvent) {
        switch (game_event.type) {
            case GameEventType.PLAYER_ACTION:
                TheGame.process_player_action(game_event.player_action!);
                break;

            case GameEventType.MAYBE_COMPLETE_TURN:
                TheGame.maybe_complete_turn();
                break;

            case GameEventType.ADVANCE_TURN:
                TheGame.advance_turn_to_next_player();
                break;

            case GameEventType.UNDO:
                // We only use this code path in the multi-player
                // scenario. When a user undoes her own actions,
                // we call undo_last_player_action directly. When
                // we run the replay feature, there should never be
                // undo events in the stack, because we never push
                // them.
                this.undo_last_player_action();
                break;
        }

        PlayerArea.populate();
        BoardArea.populate();
    }

    undo_last_player_action(): void {
        const player_action = this.pop_player_action();
        if (!player_action) {
            console.error("could not find player action to undo!");
            return;
        }

        TheGame.reverse_player_action(player_action);
    }

    replay(): void {
        const self = this;

        StatusBar.scold("REPLAY RUNNING! Just watch, don't touch, please.");

        function show(): void {
            PlayerArea.populate();
            BoardArea.populate();
        }

        const game_events = this.json_game_events.map((json_game_event) => {
            return GameEvent.from_json(json_game_event);
        });

        let interval = 1000;

        if (game_events.length > 50) {
            interval = 100;
        } else if (game_events.length > 20) {
            interval = 200;
        } else if (game_events.length > 5) {
            interval = 500;
        }

        this.replay_in_progress = true;

        const player_names = PlayerGroup.get_player_names();

        TheDeck = this.orig_deck.clone();
        CurrentBoard = this.orig_board.clone();
        PlayerGroup = new PlayerGroupSingleton(player_names);
        show();
        ActivePlayer.start_turn();
        setTimeout(show, interval);

        let i = 0;

        function step() {
            if (i >= game_events.length) {
                self.replay_in_progress = false;
                show();
                StatusBar.celebrate("REPLAY FINISHED! You may resume playing.");
                return;
            }

            const game_event = game_events[i];
            self.play_game_event(game_event);
            i += 1;

            setTimeout(step, interval);
        }

        setTimeout(step, interval);
    }
}

class GameEvent {
    // This is just a glorified struct! Callers are allowed
    // to directly reference anything they want, but they should
    // never mutate anything.

    type: GameEventType;
    player_action?: PlayerAction;

    constructor(type: GameEventType, player_action?: PlayerAction) {
        this.type = type;
        this.player_action = player_action;
    }

    toJSON(): JsonGameEvent {
        const json_player_action = this.player_action?.toJSON();
        return { type: this.type, player_action: json_player_action };
    }

    static from_json(json: JsonGameEvent): GameEvent {
        const type = json.type;
        const player_action = json.player_action
            ? PlayerAction.from_json(json.player_action)
            : undefined;
        return new GameEvent(type, player_action);
    }
}

function pluralize(count: number, noun: string) {
    const s = count === 1 ? "" : "s";
    return `${count} ${noun}${s}`;
}

/***********************************************

    TRY TO KEEP MODEL CODE ABOVE ^^^^^

    TRY TO KEEP UI CODE BELOW vvvvv

***********************************************/

function css_color(card_color: CardColor): string {
    return card_color == CardColor.RED ? "red" : "black";
}

function set_common_card_styles(node: HTMLElement): void {
    node.style.display = "inline-block";
    node.style.height = "40px";
    node.style.padding = "1px";
    node.style.userSelect = "none";
    node.style.textAlign = "center";
    node.style.verticalAlign = "center";
    node.style.fontSize = "17px";
}

function render_card_char(c: string): HTMLElement {
    const div = document.createElement("div");
    div.style.display = "block";
    div.style.userSelect = "none";
    div.innerText = c;
    return div;
}

function render_playing_card(card: Card): HTMLElement {
    const div = document.createElement("div");
    const v_node = render_card_char(value_str(card.value));
    const s_node = render_card_char(suit_emoji_str(card.suit));
    div.append(v_node);
    div.append(s_node);

    div.style.color = css_color(card.color);
    div.style.backgroundColor = "white";
    div.style.border = "1px blue solid";
    div.style.width = pixels(CARD_WIDTH);

    set_common_card_styles(div);

    return div;
}

function render_wing(): HTMLElement {
    const div = document.createElement("div");
    div.style.backgroundColor = "transparent";

    const v_node = render_card_char("+");
    const s_node = render_card_char("+");
    v_node.style.color = "transparent";
    s_node.style.color = "transparent";

    div.append(v_node);
    div.append(s_node);
    div.style.width = "0px";

    set_common_card_styles(div);

    return div;
}

function render_hand_card_row(card_spans: HTMLElement[]): HTMLElement {
    const div = document.createElement("div");
    div.style.paddingBottom = "10px";
    for (const card_span of card_spans) {
        div.append(card_span);
    }
    return div;
}

function render_card_stack(
    left_wing: HTMLElement,
    card_spans: HTMLElement[],
    right_wing: HTMLElement,
): HTMLElement {
    const div = document.createElement("div");
    div.style.userSelect = "none";

    div.append(left_wing);
    for (const card_span of card_spans) {
        div.append(card_span);
    }
    div.append(right_wing);

    return div;
}

function render_player_advice(): HTMLElement {
    const div = document.createElement("div");
    div.innerText = `
        Play as both players to maximize the fun!`;
    return div;
}

function render_deck_empty(): HTMLElement {
    const div = document.createElement("div");

    div.style.maxWidth = "300px";

    const p1 = document.createElement("p");
    p1.innerText = `You have played the entire deck (two decks, actually)!`;
    p1.style.fontWeight = "bold";

    const p2 = document.createElement("p");
    p2.innerText = `You can keep trying to score even with empty hands\
        by organizing the board.  Or just reload the browser to start\
        a new game.`;

    div.append(p1);
    div.append(p2);
    return div;
}

function render_deck_size(): HTMLElement {
    const div = document.createElement("div");
    const cards = pluralize(TheDeck.size(), "more card");
    div.innerText = `
        The deck has ${cards}.`;
    return div;
}

function render_board_heading(): HTMLElement {
    const heading = document.createElement("div");
    heading.innerText = "Board";
    heading.style.color = heading_color();
    heading.style.fontWeight = "bold";
    heading.style.fontSize = "19px";
    heading.style.marginTop = "20px";
    heading.style.color = heading_color();
    return heading;
}

function style_player_name(name: HTMLElement): void {
    name.style.fontWeight = "bold";
    name.style.fontSize = "19px";
    name.style.marginTop = "20";
    name.style.marginBottom = "5px";
    name.style.color = heading_color();
}

function render_hand_advice(): HTMLElement {
    const div = document.createElement("div");
    div.innerText = "Drag individual cards to the board.";
    div.style.fontSize = "12px";
    div.style.marginBottom = "3px";
    return div;
}

function render_board(): HTMLElement {
    const div = document.createElement("div");
    div.style.backgroundColor = "khaki";
    div.style.border = "1px solid #000080";
    div.style.borderRadius = "15px";
    div.style.position = "relative";
    div.style.height = "540px";
    div.style.marginTop = "8px";
    return div;
}

function render_board_advice(): HTMLElement {
    const div = document.createElement("div");
    div.innerText =
        "Drag piles to move them or merge them. Click on piles to break them up.";
    div.style.fontSize = "12px";
    div.style.marginTop = "1px";
    return div;
}

function render_complete_turn_button(): HTMLElement {
    const button = document.createElement("button");
    button.classList.add("button", "complete-turn-button");
    button.style.backgroundColor = button_color();
    button.style.color = "white";
    button.style.marginRight = "5px";
    button.style.cursor = "pointer";
    button.innerText = "Complete turn";
    return button;
}

function render_replay_button(): HTMLElement {
    const button = document.createElement("button");
    button.classList.add("button", "replay-button");
    button.style.backgroundColor = "green";
    button.style.color = "white";
    button.innerText = "Instant replay (entire game)";
    button.style.position = "absolute";
    button.style.top = "0";
    button.style.right = "0";
    button.style.cursor = "pointer";
    return button;
}

function render_undo_button(): HTMLElement {
    const button = document.createElement("button");
    button.classList.add("button", "undo-button");
    button.style.backgroundColor = button_color();
    button.style.color = "white";
    button.innerText = "Undo mistakes";
    button.style.position = "absolute";
    button.style.top = "0";
    button.style.right = "0";
    button.style.cursor = "pointer";
    return button;
}

function render_hint_button(): HTMLElement {
    const button = document.createElement("button");
    button.classList.add("button", "hint-button");
    button.style.backgroundColor = "darkgreen";
    button.style.color = "white";
    button.innerText = "Hint";
    button.style.cursor = "pointer";
    button.style.marginTop = "6px";
    button.style.display = "block";
    button.style.marginBottom = "2px";
    return button;
}

function heading_color() {
    return button_color(); // needs another color haha
}

function button_color() {
    return "#000080"; // navy blue
}

/***********************************************

    TRY TO KEEP PURE DRAWING CODE ABOVE ^^^^^

    TRY TO KEEP OTHER UI CODE BELOW vvvvv

***********************************************/

function opponent_card_color(): string {
    return "lavender";
}

function new_card_color(): string {
    return "cyan";
}

class PhysicalHandCard {
    hand_card: HandCard;
    card: Card;
    card_span: HTMLElement;
    is_hint: boolean;

    constructor(hand_card: HandCard, is_hint = false) {
        this.hand_card = hand_card;
        this.card = hand_card.card;
        this.is_hint = is_hint;
        this.card_span = render_playing_card(this.card);
        this.card_span.style.margin = "3px";
        this.card_span.style.cursor = "grab";
        this.allow_dragging();
        this.update_state_styles();
    }

    dom() {
        return this.card_span;
    }

    get_width() {
        return this.card_span.clientWidth;
    }

    allow_dragging() {
        const div = this.card_span;
        const hand_card = this.hand_card;

        DragDropHelper.enable_drag({
            div,
            handle_dragstart(): void {
                StatusBar.inform("Drag to the board.");
                PhysicalBoard.display_mergeable_stacks_for_card(hand_card);
            },
            handle_ordinary_move(): void {
                const loc = loc_on_board(div);
                const new_stack = CardStack.from_hand_card(hand_card, loc);
                const player_action = PlayerAction.hand_card_action({
                    board_event: new BoardEvent({
                        stacks_to_remove: [],
                        stacks_to_add: [new_stack],
                    }),
                    hand_cards_to_release: [hand_card],
                });
                EventManager.place_hand_card_on_board(player_action);
            },
        });
    }

    update_state_styles(): void {
        const span = this.card_span;

        if (this.is_hint) {
            span.style.backgroundColor = "lightgreen";
        } else if (this.hand_card.state === HandCardState.FRESHLY_DRAWN) {
            span.style.backgroundColor = new_card_color();
        } else if (this.hand_card.state === HandCardState.BACK_FROM_BOARD) {
            span.style.backgroundColor = "yellow";
        } else {
            span.style.backgroundColor = "white";
        }
    }
}

class PhysicalBoardCard {
    board_card: BoardCard;
    card_span: HTMLElement;

    constructor(card_stack: CardStack, card_index: number) {
        const board_card = card_stack.board_cards[card_index];
        const card_span = render_playing_card(board_card.card);

        this.board_card = board_card;
        this.card_span = card_span;
        this.update_state_styles();

        DragDropHelper.accept_click({
            div: card_span,
            on_click() {
                if (card_stack.size() === 1) {
                    StatusBar.scold(
                        "Clicking here does nothing. Maybe you want to drag it instead?",
                    );
                    return;
                }
                const stacks_to_add = card_stack.split(card_index);
                const player_action = PlayerAction.board_action(
                    new BoardEvent({
                        stacks_to_remove: [card_stack],
                        stacks_to_add,
                    }),
                );
                EventManager.split_stack(player_action);
            },
        });
    }

    dom(): HTMLElement {
        return this.card_span;
    }

    update_state_styles(): void {
        const span = this.card_span;
        const state = this.board_card.state;

        if (state === BoardCardState.FRESHLY_PLAYED) {
            span.style.backgroundColor = new_card_color();
        } else if (state === BoardCardState.FRESHLY_PLAYED_BY_LAST_PLAYER) {
            span.style.backgroundColor = opponent_card_color();
        } else {
            span.style.backgroundColor = "white";
        }
    }
}

function pixels(num: number): string {
    return `${num}px`;
}

class PhysicalCardStack {
    stack: CardStack;
    div: HTMLElement;
    left_wing: HTMLElement;
    right_wing: HTMLElement;

    constructor(stack: CardStack) {
        this.stack = stack;

        const card_spans = [];

        for (let i = 0; i < stack.board_cards.length; ++i) {
            const physical_board_card = new PhysicalBoardCard(stack, i);
            const card_span = physical_board_card.dom();
            if (i !== 0) {
                card_span.style.marginLeft = "2px";
            }
            card_spans.push(card_span);
        }

        const left_wing = render_wing();
        const right_wing = render_wing();

        const div = render_card_stack(left_wing, card_spans, right_wing);
        div.style.top = pixels(stack.loc.top);
        div.style.left = pixels(stack.loc.left);
        div.style.position = "absolute";

        if (this.stack.incomplete()) {
            div.style.border = "1px gray solid";
            div.style.backgroundColor = "gray";
        }

        this.div = div;
        this.left_wing = left_wing;
        this.right_wing = right_wing;
        this.allow_dragging();
    }

    dom(): HTMLElement {
        return this.div;
    }

    style_as_mergeable(wing_div: HTMLElement): void {
        this.div.style.backgroundColor = "hsl(105, 72.70%, 87.10%)";
        wing_div.style.backgroundColor = "hsl(105, 72.70%, 87.10%)";
        wing_div.style.width = pixels(CARD_WIDTH);
    }

    style_for_hover(wing_div: HTMLElement): void {
        this.div.style.backgroundColor = "mauve";
        wing_div.style.backgroundColor = "mauve";
    }

    maybe_prep_left_hand_card_merge(hand_card: HandCard): void {
        const loc = { top: -1, left: -1 };
        const other_stack = CardStack.from_hand_card(hand_card, loc);
        const new_stack = this.stack.left_merge(other_stack);

        if (new_stack === undefined) {
            return;
        }

        const player_action = PlayerAction.hand_card_action({
            board_event: new BoardEvent({
                stacks_to_remove: [this.stack],
                stacks_to_add: [new_stack],
            }),
            hand_cards_to_release: [hand_card],
        });

        this.prep_left_merge(player_action);
    }

    maybe_prep_right_hand_card_merge(hand_card: HandCard): void {
        const loc = { top: -1, left: -1 };
        const other_stack = CardStack.from_hand_card(hand_card, loc);
        const new_stack = this.stack.right_merge(other_stack);

        if (new_stack === undefined) {
            return;
        }

        const player_action = PlayerAction.hand_card_action({
            board_event: new BoardEvent({
                stacks_to_remove: [this.stack],
                stacks_to_add: [new_stack],
            }),
            hand_cards_to_release: [hand_card],
        });

        this.prep_right_merge(player_action);
    }

    maybe_prep_left_stack_merge(other_stack: CardStack): void {
        const new_stack = this.stack.left_merge(other_stack);

        if (new_stack === undefined) {
            return;
        }

        const player_action = PlayerAction.board_action(
            new BoardEvent({
                stacks_to_remove: [this.stack, other_stack],
                stacks_to_add: [new_stack],
            }),
        );

        this.prep_left_merge(player_action);
    }

    maybe_prep_right_stack_merge(other_stack: CardStack): void {
        const new_stack = this.stack.right_merge(other_stack);

        if (new_stack === undefined) {
            return;
        }

        const player_action = PlayerAction.board_action(
            new BoardEvent({
                stacks_to_remove: [this.stack, other_stack],
                stacks_to_add: [new_stack],
            }),
        );

        this.prep_right_merge(player_action);
    }

    prep_left_merge(player_action: PlayerAction): void {
        const self = this;
        const wing_div = this.left_wing;

        this.div.style.left = pixels(this.stack.loc.left - CARD_WIDTH);
        self.style_as_mergeable(wing_div);

        DragDropHelper.accept_drop({
            div: wing_div,
            on_over() {
                self.style_for_hover(wing_div);
            },
            on_leave() {
                self.style_as_mergeable(wing_div);
            },
            on_drop() {
                EventManager.process_merge(player_action);
            },
        });
    }

    prep_right_merge(player_action: PlayerAction): void {
        const self = this;
        const wing_div = this.right_wing;

        self.style_as_mergeable(wing_div);

        DragDropHelper.accept_drop({
            div: wing_div,
            on_over() {
                self.style_for_hover(wing_div);
            },
            on_leave() {
                self.style_as_mergeable(wing_div);
            },
            on_drop() {
                EventManager.process_merge(player_action);
            },
        });
    }

    allow_dragging() {
        const div = this.div;
        const card_stack = this.stack;

        DragDropHelper.enable_drag({
            div,
            handle_dragstart(): void {
                StatusBar.inform(
                    "Drag to the edge of a stack or any empty space.",
                );
                PhysicalBoard.display_mergeable_stacks_for(card_stack);
            },
            handle_ordinary_move() {
                // We now make a very similar model stack with
                // a new location rather than mutating the stack.
                const loc = {
                    left: parseFloat(div.style.left),
                    top: parseFloat(div.style.top),
                };
                const new_stack = new CardStack(card_stack.board_cards, loc);
                const player_action = PlayerAction.board_action(
                    new BoardEvent({
                        stacks_to_remove: [card_stack],
                        stacks_to_add: [new_stack],
                    }),
                );
                EventManager.move_stack(player_action);
            },
        });
    }
}

let PhysicalBoard: PhysicalBoardSingleton;

class PhysicalBoardSingleton {
    div: HTMLElement;
    physical_card_stacks: PhysicalCardStack[];

    constructor() {
        this.div = render_board();

        this.physical_card_stacks = CurrentBoard.card_stacks.map(
            (card_stack) => {
                return new PhysicalCardStack(card_stack);
            },
        );

        for (const physical_card_stack of this.physical_card_stacks) {
            this.div.append(physical_card_stack.dom());
        }
    }

    display_mergeable_stacks_for(card_stack: CardStack): void {
        for (const physical_card_stack of this.physical_card_stacks) {
            physical_card_stack.maybe_prep_left_stack_merge(card_stack);
            physical_card_stack.maybe_prep_right_stack_merge(card_stack);
        }
    }

    display_mergeable_stacks_for_card(hand_card: HandCard): void {
        for (const physical_card_stack of this.physical_card_stacks) {
            physical_card_stack.maybe_prep_left_hand_card_merge(hand_card);
            physical_card_stack.maybe_prep_right_hand_card_merge(hand_card);
        }
    }

    dom() {
        return this.div;
    }
}

function row_of_cards_in_hand(
    hand_cards: HandCard[],
    hint_cards: Set<HandCard> = new Set(),
): HTMLElement {
    /*
        This can be a pure function, because even though
        users can mutate our row (by clicking a card to put it
        out to the board), we don't ever have to re-draw
        ourself.  We just let PhysicalHand re-populate the
        entire hand, since the hand is usually super small.
    */
    const card_spans = [];

    for (const hand_card of hand_cards) {
        const physical_hand_card = new PhysicalHandCard(
            hand_card,
            hint_cards.has(hand_card),
        );
        const span = physical_hand_card.dom();
        card_spans.push(span);
    }

    return render_hand_card_row(card_spans);
}

class PhysicalHand {
    hand: Hand;
    div: HTMLElement;

    constructor(hand: Hand) {
        this.hand = hand;
        this.div = this.make_div();
    }

    make_div(): HTMLElement {
        // no real styling yet
        const div = document.createElement("div");
        div.style.marginTop = "10px";
        return div;
    }

    dom(): HTMLElement {
        this.populate();
        return this.div;
    }

    populate(hint_cards: Set<HandCard> = new Set()): void {
        const div = this.div;
        const hand_cards = this.hand.hand_cards;
        div.innerHTML = "";

        for (const suit of all_suits) {
            const suit_cards = get_sorted_cards_for_suit(suit, hand_cards);

            if (suit_cards.length > 0) {
                const row = row_of_cards_in_hand(suit_cards, hint_cards);
                div.append(row);
            }
        }
    }
}

class PhysicalPlayer {
    player: Player;
    physical_hand: PhysicalHand;
    complete_turn_button: CompleteTurnButton;
    div: HTMLElement;

    constructor(player: Player) {
        this.player = player;
        this.physical_hand = new PhysicalHand(player.hand);
        this.complete_turn_button = new CompleteTurnButton();
        this.div = document.createElement("div");
        this.div.style.minWidth = "250px";
        this.div.style.paddingBottom = "15px";
        this.div.style.borderBottom = "1px #000080 solid";
    }

    dom(): HTMLElement {
        return this.div;
    }

    score(): HTMLElement {
        const div = document.createElement("div");

        const score = this.player.get_updated_score();

        div.innerText = `Score: ${score}`;
        div.style.color = "maroon";
        div.style.marginBottom = "4px";
        return div;
    }

    card_count(): HTMLElement {
        const div = document.createElement("div");

        const count = this.player.hand.size();

        div.innerText = `${count} cards`;
        return div;
    }

    populate() {
        const player = this.player;
        const div = this.div;
        div.innerHTML = "";

        const name = editable_text(player.name, (player_name) => {
            player.name = player_name;
        });
        const name_div = name.dom();
        style_player_name(name_div);

        div.append(name_div);
        div.append(this.score());

        if (this.player.show) {
            div.append(this.physical_hand.dom());
            if (this.player.active) {
                div.append(render_hand_advice());
                div.append(new HintButton().dom());
                div.append(this.complete_turn_button.dom());
            }
        } else {
            div.append(this.card_count());
        }
    }

    take_card_back(hand_card: HandCard) {
        this.player.take_card_back(hand_card);
        this.physical_hand.populate();
    }

    release_card(hand_card: HandCard) {
        this.player.release_card(hand_card);
        this.physical_hand.populate();
    }
}

let PlayerArea: PlayerAreaSingleton;

class PlayerAreaSingleton {
    div: HTMLElement;
    physical_players?: PhysicalPlayer[];

    constructor(player_area: HTMLElement) {
        this.div = player_area;
    }

    get_physical_hand_for_player(player_index: number): PhysicalHand {
        return this.physical_players![player_index].physical_hand;
    }

    show_hints(hint_cards: Set<HandCard>): void {
        const physical_hand = this.get_physical_hand_for_player(
            PlayerGroup.current_player_index,
        );
        physical_hand.populate(hint_cards);
    }

    populate(): void {
        const div = this.div;

        this.physical_players = PlayerGroup.players.map(
            (player) => new PhysicalPlayer(player),
        );

        div.innerHTML = "";
        for (const physical_player of this.physical_players) {
            physical_player.populate();
            div.append(physical_player.dom());
        }
        if (TheDeck.size() === 0) {
            div.append(render_deck_empty());
        } else {
            div.append(render_deck_size());
        }
        div.append(render_player_advice());
    }
}

let BoardArea: BoardAreaSingleton;

class BoardAreaSingleton {
    div: HTMLElement;

    constructor(board_area: HTMLElement) {
        this.div = board_area;
        this.div.style.position = "relative";
    }

    dom(): HTMLElement {
        return this.div;
    }

    populate(): void {
        const div = this.div;

        div.innerHTML = "";

        PhysicalBoard = new PhysicalBoardSingleton();

        div.append(render_board_heading());
        div.append(render_board_advice());

        if (!GameEventTracker.replay_in_progress) {
            if (CurrentBoard.is_clean()) {
                if (!GameEventTracker.empty()) {
                    div.append(new ReplayButton().dom());
                }
            } else {
                div.append(new UndoButton().dom());
            }
        }

        div.append(PhysicalBoard.dom());
    }
}

class PhysicalGame {
    constructor(info: {
        player_area: HTMLElement;
        board_area: HTMLElement;
    }) {
        const { player_area, board_area } = info;

        PlayerArea = new PlayerAreaSingleton(player_area);
        BoardArea = new BoardAreaSingleton(board_area);
        BoardArea.populate();
        PlayerArea.populate();
        StatusBar.inform(
            "Begin game. You can drag and drop hand cards or board piles to piles or empty spaces on the board.",
        );
    }

    get_physical_hand(): PhysicalHand {
        const index = PlayerGroup.current_player_index;
        return PlayerArea.get_physical_hand_for_player(index);
    }
}

class CompleteTurnButton {
    button: HTMLElement;

    constructor() {
        const button = render_complete_turn_button();

        button.addEventListener("click", () => {
            EventManager.maybe_complete_turn();
        });
        this.button = button;
    }

    dom(): HTMLElement {
        return this.button;
    }
}

class ReplayButton {
    button: HTMLElement;

    constructor() {
        const button = render_replay_button();
        button.addEventListener("click", () => {
            GameEventTracker.replay();
        });
        this.button = button;
    }

    dom(): HTMLElement {
        return this.button;
    }
}

class UndoButton {
    button: HTMLElement;

    constructor() {
        const button = render_undo_button();
        button.addEventListener("click", () => {
            EventManager.undo_mistakes();
        });
        this.button = button;
    }

    dom(): HTMLElement {
        return this.button;
    }
}

class HintButton {
    button: HTMLElement;

    constructor() {
        const button = render_hint_button();
        button.addEventListener("click", () => {
            EventManager.show_hints();
        });
        this.button = button;
    }

    dom(): HTMLElement {
        return this.button;
    }
}

function clean_board_message(prefix: string): string {
    const delta = ActivePlayer.player_turn ? ActivePlayer.get_board_delta() : 0;
    return `${prefix} Your board delta for this turn is ${delta}.`;
}

let EventManager: EventManagerSingleton;

class EventManagerSingleton {
    maybe_complete_turn(): void {
        const self = this;

        GameEventTracker.push_event(
            new GameEvent(GameEventType.MAYBE_COMPLETE_TURN),
        );
        const turn_result = TheGame.maybe_complete_turn();

        PlayerArea.populate();

        switch (turn_result) {
            case CompleteTurnResult.FAILURE:
                SoundEffects.play_purr_sound();
                Popup.show({
                    content: `The board is not clean!\
                        \n\n(nor is my litter box)\
                        \n\nUse the "Undo mistakes" button if you need to.`,
                    confirm_button_text: "Oy vey, ok",
                    type: "warning",
                    admin: Admin.ANGRY_CAT,
                    callback() {},
                });
                return;

            case CompleteTurnResult.SUCCESS_BUT_NEEDS_CARDS: {
                const turn_score = ActivePlayer.get_turn_score();
                SoundEffects.play_purr_sound();
                const cards = ActivePlayer.cards_drawn_for_next_turn();
                Popup.show({
                    content: `Sorry you couldn't find a move.\
                        \n\
                        \nI'm going back to my nap!\
                        \n\
                        \nYou scored ${turn_score} points for your turn.\
                        \n\
                        \nWe have dealt you ${cards} for your next turn.`,
                    type: "warning",
                    confirm_button_text: "Ok",
                    admin: Admin.OLIVER,
                    callback() {
                        self.advance_turn();
                    },
                });
                break;
            }

            case CompleteTurnResult.SUCCESS_AS_VICTOR: {
                const turn_score = ActivePlayer.get_turn_score();
                // Only play this for the first time a player gets
                // rid of all the cards in their hand.
                SoundEffects.play_bark_sound();

                const cards = ActivePlayer.cards_drawn_for_next_turn();
                Popup.show({
                    content: `You are the first person to play all their cards!\
                        \n\
                        \nThat earns you a 1500 point bonus.\
                        \n\
                        \nYou got ${turn_score} points for this turn.\
                        \n\
                        \nWe have dealt your ${cards} for your next turn.\
                        \n\
                        \nKeep winning!`,
                    type: "success",
                    admin: Admin.STEVE,
                    confirm_button_text: "Continue dominating",
                    callback() {
                        self.advance_turn();
                    },
                });
                break;
            }

            case CompleteTurnResult.SUCCESS_WITH_HAND_EMPTIED: {
                const turn_score = ActivePlayer.get_turn_score();
                const cards = ActivePlayer.cards_drawn_for_next_turn();

                Popup.show({
                    content: `Good job!\
                    \n\
                    \nYour scored ${turn_score} for this turn!!\
                    \n\
                    \nWe gave you a bonus for emptying your hand.\
                    \n\
                    \nWe have dealt you ${cards} for your next turn.`,
                    admin: Admin.STEVE,
                    confirm_button_text: "Back on the road!",
                    callback() {
                        self.advance_turn();
                    },
                    type: "success",
                });
                break;
            }

            case CompleteTurnResult.SUCCESS: {
                const turn_score = ActivePlayer.get_turn_score();

                Popup.show({
                    content: `The board is growing!\
                         \n\
                         \nYou receive ${turn_score} points for this turn!`,
                    type: "success",
                    confirm_button_text: "Go to next player",
                    admin: Admin.STEVE,
                    callback() {
                        self.advance_turn();
                    },
                });
                break;
            }
        }
    }

    advance_turn() {
        GameEventTracker.push_event(new GameEvent(GameEventType.ADVANCE_TURN));
        TheGame.advance_turn_to_next_player();

        DragDropHelper.reset_internal_data_structures();
        PlayerArea.populate();
        BoardArea.populate();

        StatusBar.inform(`${ActivePlayer.name}, you may begin your turn.`);
    }

    show_hints(): void {
        const hint = get_hint(
            ActivePlayer.hand.hand_cards,
            CurrentBoard.card_stacks,
        );

        switch (hint.level) {
            case HintLevel.HAND_STACKS: {
                const count = hint.hand_stacks[0].cards.length;
                StatusBar.inform(
                    `You have ${count} cards that form a ${hint.hand_stacks[0].stack_type} in your hand!`,
                );
                PlayerArea.show_hints(new Set(hint.hand_stacks[0].cards));
                break;
            }

            case HintLevel.DIRECT_PLAY: {
                const count = hint.playable_cards.length;
                StatusBar.inform(
                    `${count} card${count === 1 ? "" : "s"} can play directly onto the board.`,
                );
                PlayerArea.show_hints(new Set(hint.playable_cards));
                break;
            }

            case HintLevel.LOOSE_CARD_PLAY: {
                StatusBar.inform(hint.level);
                PlayerArea.show_hints(new Set(hint.plays[0].playable_cards));
                break;
            }

            case HintLevel.SPLIT_FOR_SET:
            case HintLevel.SPLIT_AND_INJECT:
            case HintLevel.PEEL_FOR_RUN:
            case HintLevel.PAIR_PEEL: {
                StatusBar.inform(hint.level);
                PlayerArea.show_hints(new Set(hint.playable_cards));
                break;
            }

            case HintLevel.REARRANGE_PLAY: {
                const play = hint.plays[0];
                const dest_labels = play.destination_cards
                    .map((c) => value_str(c.value) + suit_emoji_str(c.suit))
                    .join(" ");
                StatusBar.inform(
                    `Rearrange the board! Your card can join [${dest_labels}] (${play.destination_type}).`,
                );
                PlayerArea.show_hints(new Set([play.hand_card]));
                break;
            }

            case HintLevel.NO_MOVES: {
                StatusBar.scold(hint.level);
                break;
            }
        }
    }

    undo_mistakes(): void {
        GameEventTracker.broadcast_undo_event();
        GameEventTracker.undo_last_player_action();

        PlayerArea.populate();
        BoardArea.populate();

        if (CurrentBoard.is_clean()) {
            StatusBar.celebrate(clean_board_message("Back to a clean board!"));
        } else {
            StatusBar.scold("You still are in a bad state!");
        }
    }

    process_and_push_player_action(player_action: PlayerAction): void {
        GameEventTracker.push_event(
            new GameEvent(GameEventType.PLAYER_ACTION, player_action),
        );

        TheGame.process_player_action(player_action);
    }

    split_stack(player_action: PlayerAction): void {
        this.process_and_push_player_action(player_action);
        StatusBar.scold(
            "Be careful with splitting! Splits only pay off when you get more cards on the board or make prettier piles.",
        );
    }

    place_hand_card_on_board(player_action: PlayerAction): void {
        this.process_and_push_player_action(player_action);
        StatusBar.inform("On the board!");
    }

    move_stack(player_action: PlayerAction): void {
        this.process_and_push_player_action(player_action);
        StatusBar.inform("Moved!");
    }

    // This function works for both dragging board stacks
    // and dragging hand cards to an existing board stack.

    process_merge(player_action: PlayerAction): void {
        this.process_and_push_player_action(player_action);

        const merged_stack = player_action.board_event.stacks_to_add[0];
        const size = merged_stack.size();

        if (size >= 3) {
            SoundEffects.play_ding_sound();
            if (CurrentBoard.is_clean()) {
                StatusBar.celebrate(
                    clean_board_message("Combined! Clean board!"),
                );
            } else {
                StatusBar.celebrate("Combined!");
            }
        } else {
            StatusBar.scold("Nice, but where's the third card?");
        }

        // PlayerArea/BoardArea get updated elsewhere
    }
}

/***********************************************

GENERIC WIDGETS vvvv

***********************************************/

class EditableText {
    div: HTMLElement;
    text_div: HTMLElement;
    edit_div?: HTMLElement;
    edit_input?: HTMLInputElement;
    val: string;
    set_callback: (new_val: string) => void;

    constructor(val: string, set_callback: (new_val: string) => void) {
        this.val = val;
        this.set_callback = set_callback;

        const div = document.createElement("div");
        this.div = div;
        div.style.display = "flex";

        const text_div = document.createElement("div");
        this.text_div = text_div;
        text_div.innerText = val;
        text_div.title = "click to edit";
        text_div.style.userSelect = "none";
        text_div.style.cursor = "pointer";

        text_div.addEventListener("click", () => {
            this.edit_text();
        });

        div.append(text_div);
    }

    dom(): HTMLElement {
        return this.div;
    }

    make_edit_input(): HTMLInputElement {
        const input = document.createElement("input");

        input.type = "text";
        input.value = this.val;
        input.style.width = "100px";

        return input;
    }

    save_button(): HTMLElement {
        const button = document.createElement("button");
        button.style.cursor = "pointer";
        button.style.backgroundColor = "green";
        button.style.color = "white";
        button.style.padding = "1px";
        button.style.marginLeft = "3px";
        button.style.fontSize = "10px";
        button.innerText = "save";

        button.addEventListener("click", () => {
            this.maybe_save();
        });

        return button;
    }

    maybe_save(): void {
        const div = this.div;
        const edit_div = this.edit_div!;
        const edit_input = this.edit_input!;
        const text_div = this.text_div;

        const new_val = edit_input.value;

        if (new_val) {
            this.set_callback(new_val);
            this.val = new_val;
        }

        edit_div.remove();
        div.innerHTML = "";
        text_div.innerText = this.val;
        div.append(text_div);
    }

    edit_text(): void {
        const div = this.div;

        const edit_div = document.createElement("document");
        edit_div.style.display = "flex";

        const edit_input = this.make_edit_input();

        const save_button = this.save_button();

        edit_div.append(edit_input);
        div.innerHTML = "";
        div.append(edit_div);
        div.append(save_button);

        edit_input.focus();
        edit_input.select();

        this.edit_input = edit_input;
        this.edit_div = edit_div;
    }
}

function editable_text(val: string, set_callback: (new_val: string) => void) {
    const widget = new EditableText(val, set_callback);

    return {
        dom() {
            return widget.dom();
        },
    };
}

/***********************************************

POPUP SYSTEM vvvv

***********************************************/

type PopupType = "warning" | "success" | "info";

enum Admin {
    STEVE = "Steve",
    OLIVER = "Oliver",
    ANGRY_CAT = "Angry Cat",
    CAT_PROFESSOR = "Mr. Professor",
}

type PopupOptions = {
    content: string;
    type: PopupType;
    confirm_button_text: string;
    admin: Admin;
    callback: () => void;
};

class DialogShell {
    popup_element: HTMLDialogElement;

    constructor() {
        this.popup_element = this.create_popup_element();
    }

    create_popup_element() {
        // See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
        const dialog = document.createElement("dialog");
        const s = dialog.style;
        s.maxWidth = "150vw";
        s.borderRadius = "1rem";
        s.outline = "none";
        s.border = "1px #000080 solid";
        s.display = "flex";
        s.flexDirection = "column";
        s.gap = "0.5rem";
        s.alignItems = "center";
        return dialog;
    }

    invoke_with_custom_html(html: HTMLElement, background_color: string) {
        document.body.append(this.popup_element);
        this.popup_element.style.backgroundColor = background_color;

        // Ensures it is closed by nothing apart from what we define
        this.popup_element.setAttribute("closedby", "none");
        this.popup_element.append(html);
        this.popup_element.showModal();
    }

    finish(): void {
        this.popup_element.close();
        this.popup_element.innerHTML = "";
        this.popup_element.remove();
        this.popup_element.setAttribute("closedby", "any");
    }
}

let Popup: PopupSingleton;

class PopupSingleton {
    dialog_shell: DialogShell;

    constructor() {
        this.dialog_shell = new DialogShell();
    }

    avatar_img(admin: Admin) {
        const img = document.createElement("img");
        img.style.width = "4rem";
        img.style.height = "4rem";
        switch (admin) {
            case Admin.STEVE:
                img.src = "images/steve.png";
                break;
            case Admin.CAT_PROFESSOR:
                img.src = "images/cat_professor.webp";
                break;
            case Admin.ANGRY_CAT:
                img.src = "images/angry_cat.png";
                break;
            case Admin.OLIVER:
                img.src = "images/oliver.png";
                break;
        }
        return img;
    }

    make_button(text: string): HTMLElement {
        const button = document.createElement("button");
        button.style.cursor = "pointer";
        button.style.maxWidth = "fit-content";
        button.style.paddingLeft = "15px";
        button.style.paddingRight = "15px";
        button.style.paddingTop = "5px";
        button.style.paddingBottom = "5px";
        button.style.marginTop = "15px";
        button.style.backgroundColor = "#000080";
        button.style.color = "white";

        button.innerText = text;
        return button;
    }

    admin_name(admin: string): HTMLElement {
        const div = document.createElement("div");
        div.innerText = admin;
        div.style.fontSize = "11px";
        div.style.color = "#000080";

        return div;
    }

    get_background_color(info_type: string): string {
        switch (info_type) {
            case "info":
                return "#ADD8E6";
            case "success":
                return "white";
            case "warning":
                return "#FFFFE0";
        }

        return "transparent";
    }

    show(info: PopupOptions) {
        // AVATAR in left
        const left = document.createElement("div");
        left.style.marginRight = "30px";

        left.append(this.avatar_img(info.admin));
        left.append(this.admin_name(info.admin));

        // TEXT and BUTTON in right
        const right = document.createElement("div");

        const content_div = document.createElement("pre");
        content_div.innerText = this.clean_multi_string(info.content);
        right.append(content_div);

        const button = this.make_button(info.confirm_button_text);
        button.addEventListener("click", () => this.finish(info));
        right.append(button);

        // PUT THEM ALL TOGETHER

        const flex_div = document.createElement("div");
        flex_div.style.display = "flex";
        flex_div.append(left);
        flex_div.append(right);

        this.dialog_shell.invoke_with_custom_html(
            flex_div,
            this.get_background_color(info.type),
        );
    }

    clean_multi_string(text: string) {
        return text
            .split("\n")
            .map((s) => s.trimEnd())
            .join("\n");
    }

    finish(info: PopupOptions) {
        this.dialog_shell.finish();
        info.callback();
    }
}

/***********************************************

DRAG AND DROP vvvv

***********************************************/

function loc_on_board(e1: HTMLElement): BoardLocation {
    const e2 = PhysicalBoard.dom();

    const rect1 = e1.getBoundingClientRect();
    const rect2 = e2.getBoundingClientRect();

    return {
        left: rect1.left - rect2.left,
        top: rect1.top - rect2.top,
    };
}

function inside_board(e1: HTMLElement): boolean {
    const e2 = PhysicalBoard.dom();

    const rect1 = e1.getBoundingClientRect();
    const rect2 = e2.getBoundingClientRect();

    return (
        rect1.left > rect2.left &&
        rect1.right < rect2.right &&
        rect1.top > rect2.top &&
        rect1.bottom < rect2.bottom
    );
}

function overlap(e1: HTMLElement, e2: HTMLElement) {
    const rect1 = e1.getBoundingClientRect();
    const rect2 = e2.getBoundingClientRect();

    const overlap = !(
        rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom
    );

    return overlap;
}

type DropTarget = {
    div: HTMLElement;
    on_over: () => void;
    on_leave: () => void;
    on_drop: () => void;
};

let DragDropHelper: DragDropHelperSingleton;

class DragDropHelperSingleton {
    seq: number;
    drop_targets: Map<string, DropTarget>;
    on_click_callbacks: Map<string, () => void>;

    constructor() {
        this.seq = 0;
        this.drop_targets = new Map();
        this.on_click_callbacks = new Map();
    }

    reset_internal_data_structures(): void {
        this.on_click_callbacks.clear();
        this.drop_targets.clear();
    }

    enable_drag(info: {
        div: HTMLElement;
        handle_dragstart: () => void;
        handle_ordinary_move: () => void;
    }): void {
        const { div, handle_dragstart, handle_ordinary_move } = info;
        const self = this;

        div.draggable = true;
        div.style.userSelect = "";
        div.style.touchAction = "none";

        let dragging = false;
        let drag_started = false;
        let active_click_key: string | undefined;
        let active_target: DropTarget | undefined;
        let orig_x = 0;
        let orig_y = 0;
        let orig_top = 0;
        let orig_left = 0;

        function dist_squared(e: PointerEvent) {
            return (orig_x - e.clientX) ** 2 + (orig_y - e.clientY) ** 2;
        }

        function maybe_get_active_click_key(
            e: PointerEvent,
        ): string | undefined {
            const elements = document.elementsFromPoint(
                e.clientX,
                e.clientY,
            ) as HTMLElement[];

            for (const element of elements) {
                if (element.dataset.click_key) {
                    return element.dataset.click_key;
                }
            }

            return undefined;
        }

        function record_coordinates(e: PointerEvent): void {
            orig_x = e.clientX;
            orig_y = e.clientY;

            orig_left = div.offsetLeft;
            orig_top = div.offsetTop;
        }

        function start_move() {
            div.style.position = "absolute";
            div.style.zIndex = "2";
        }

        function move_div(e: PointerEvent) {
            div.style.left = pixels(orig_left + e.clientX - orig_x);
            div.style.top = pixels(orig_top + e.clientY - orig_y);
        }

        function get_hovered_target(): DropTarget | undefined {
            const elements = document.querySelectorAll(".drop_target") as any;

            for (const element of elements) {
                if (overlap(div, element)) {
                    const drop_key = element.dataset.drop_key;
                    const hovered_target = self.drop_targets.get(drop_key);

                    if (hovered_target !== undefined) {
                        return hovered_target;
                    }
                }
            }
            return undefined;
        }

        div.addEventListener("pointerdown", (e) => {
            e.preventDefault();

            dragging = true;
            active_target = undefined;
            active_click_key = undefined;

            self.drop_targets.clear();

            active_click_key = maybe_get_active_click_key(e);

            div.setPointerCapture(e.pointerId);

            // We defer moving the div and calling handle_dragstart
            // until the pointer moves.
            record_coordinates(e);
        });

        div.addEventListener("pointermove", (e) => {
            if (!dragging) return false;

            if (!drag_started) {
                start_move();
                div.style.cursor = "grabbing";
                handle_dragstart();
                drag_started = true;
            }

            move_div(e);

            if (dist_squared(e) > 1) {
                active_click_key = undefined;
            }

            const hovered_target = get_hovered_target();

            if (hovered_target !== undefined) {
                if (active_target === undefined) {
                    hovered_target.on_over();
                    active_target = hovered_target;
                    return;
                } else if (hovered_target === active_target) {
                    // just ignore repeated hovers
                    return;
                } else {
                    active_target.on_leave();
                    hovered_target.on_over();
                    active_target = hovered_target;
                    return;
                }
            }

            if (active_target) {
                active_target.on_leave();
                active_target = undefined;
            }
        });

        function process_pointerup(): void {
            if (active_target) {
                active_target.on_leave();
                active_target = undefined;
            }

            // Clicks take precedence
            if (active_click_key) {
                const on_click = self.on_click_callbacks.get(active_click_key);
                if (on_click !== undefined) {
                    on_click();
                    return;
                }
            }

            if (!inside_board(div)) {
                StatusBar.scold(
                    "DON'T TOUCH THE CARDS UNLESS YOU ARE GONNA PUT THEM ON THE BOARD!",
                );
                return;
            }

            const hovered_target = get_hovered_target();

            if (hovered_target) {
                hovered_target.on_drop();
            } else {
                handle_ordinary_move();
            }
        }

        div.addEventListener("pointerup", (e) => {
            e.preventDefault();

            if (dist_squared(e) > 1) {
                active_click_key = undefined;
            }

            div.releasePointerCapture(e.pointerId);

            process_pointerup();

            // Order is import here! Clear our maps,
            // but BEFORE we re-draw the world.
            self.reset_internal_data_structures();

            // Now when we re-draw the world, the clickable
            // objects will re-register for clicks.
            PlayerArea.populate();
            BoardArea.populate();

            // We kind of don't need this after re-drawing
            // the world, but I'm paranoid.
            dragging = false;
            drag_started = false;
            active_click_key = undefined;
            active_target = undefined;
        });
    }

    new_key() {
        this.seq += 1;
        return `${this.seq}`;
    }

    accept_click(info: { div: HTMLElement; on_click: () => void }): void {
        const { div, on_click } = info;

        div.style.touchAction = "none";
        const key = this.new_key();
        div.dataset.click_key = key;
        this.on_click_callbacks.set(key, on_click);
    }

    accept_drop(drop_target: DropTarget): void {
        const key = this.new_key();
        drop_target.div.classList.add("drop_target");
        drop_target.div.dataset.drop_key = key;
        this.drop_targets.set(key, drop_target);
    }
}

let StatusBar: StatusBarSingleton;

class StatusBarSingleton {
    div: HTMLElement;
    text_div: HTMLElement;

    constructor() {
        this.div = document.createElement("div");
        this.text_div = this.make_text_div();
        this.div.append(this.text_div);
    }

    make_text_div() {
        const text_div = document.createElement("div");
        text_div.style.fontSize = "15px";
        return text_div;
    }

    dom() {
        return this.div;
    }

    scold(text: string) {
        this.text_div.style.color = "red";
        this.text_div.innerText = text;
    }

    celebrate(text: string) {
        this.text_div.style.color = "green";
        this.text_div.innerText = text;
    }

    inform(text: string) {
        this.text_div.style.color = "#31708f";
        this.text_div.innerText = text;
    }
}

class MainGamePage {
    player_area!: HTMLElement;
    board_area!: HTMLElement;

    constructor(container: HTMLElement) {
        const page = document.createElement("div");
        page.style.display = "flex";
        page.style.paddingLeft = "50px";
        page.style.paddingRight = "50px";
        container.append(page);

        const div = document.createElement("div");
        div.style.minWidth = "100%";
        div.append(this.make_top_line());
        div.append(this.make_bottom_area());
        page.append(div);

        this.start_game_components();
    }

    make_top_line(): HTMLElement {
        const top = document.createElement("div");
        const top_bar = this.make_top_bar();

        top.append(top_bar);
        top.append(StatusBar.dom());
        return top;
    }

    make_title_bar(): HTMLElement {
        const title_bar = document.createElement("div");
        title_bar.style.display = "flex";
        title_bar.style.backgroundColor = "#000080";
        title_bar.style.color = "white";
        title_bar.style.justifyContent = "center";
        title_bar.style.width = "100%";

        const title = document.createElement("div");
        title.innerText = "Welcome to Lyn Rummy! Have fun!";
        title.style.fontSize = "18";

        title_bar.append(title);
        return title_bar;
    }

    make_about(): HTMLElement {
        const about = document.createElement("div");
        about.innerText = "About";
        about.style.color = "#000080";
        about.style.userSelect = "none";
        about.style.cursor = "pointer";
        about.style.backgroundColor = "lightgray";
        about.style.marginLeft = "2px";
        about.style.paddingLeft = "2px";
        about.style.paddingRight = "2px";
        about.style.fontSize = "16px";
        about.addEventListener("click", () => {
            Popup.show({
                content:
                    "Authors:\
                    \n\
                    \n    Steve Howell\
                    \n    Apoorva Pendse\
                    \n\
                    \nThis software is completely free for users. Enjoy!\
                    \n\
                    \nThe source code is also completely free.\
                    \n\
                    \n    https://github.com/showell/LynRummy/\
                    \n\
                    \nIf you enjoy this game, please spread the word. This\
                    \ngame is also very enjoyable to play in person!\
                    \n\
                    \nYou need two decks. Shuffle them, and then deal out hands\
                    \nof about 15 cards each.",
                type: "info",
                confirm_button_text: "Got it!",
                admin: Admin.STEVE,
                callback() {},
            });
        });
        return about;
    }

    make_top_bar(): HTMLElement {
        const top_bar = document.createElement("div");
        top_bar.style.display = "flex";
        top_bar.style.minWidth = "100%";
        top_bar.style.alignItems = "stretch";

        top_bar.append(this.make_title_bar());
        top_bar.append(this.make_about());
        return top_bar;
    }

    make_bottom_area(): HTMLElement {
        const bottom = document.createElement("div");
        bottom.style.display = "flex";
        bottom.style.alignItems = "stretch";
        bottom.style.minWidth = "100%";
        const left_panel = this.make_left_panel();
        const right_panel = this.make_right_panel();
        bottom.append(left_panel);
        bottom.append(right_panel);
        return bottom;
    }

    make_left_panel(): HTMLElement {
        this.player_area = document.createElement("div");
        this.player_area.style.paddingRight = "20px";
        this.player_area.style.marginRight = "20px";
        this.player_area.style.borderRight = "1px gray solid";

        const left_panel = document.createElement("div");
        left_panel.append(this.player_area);
        return left_panel;
    }

    make_right_panel(): HTMLElement {
        this.board_area = document.createElement("div");
        const right_panel = document.createElement("div");
        right_panel.append(this.board_area);
        right_panel.style.width = "100%";
        return right_panel;
    }

    start_game_components(): void {
        const player_area = this.player_area;
        const board_area = this.board_area;

        // simply creating the object starts the game!
        new PhysicalGame({
            player_area: player_area,
            board_area: board_area,
        });
    }
}

class SoundEffectsSingleton {
    purr: HTMLAudioElement;
    bark: HTMLAudioElement;
    ding: HTMLAudioElement;

    constructor() {
        // It might be overkill to pre-load these, but I can't
        // see how it hurts either.
        this.ding = document.createElement("audio");
        this.purr = document.createElement("audio");
        this.bark = document.createElement("audio");
        this.ding.src = "ding.mp3";
        this.purr.src = "purr.mp3";
        this.bark.src = "bark.mp3";
    }

    play_ding_sound() {
        this.ding.play();
    }

    play_purr_sound() {
        this.purr.play();
    }

    play_bark_sound() {
        this.bark.play();
    }
}

let SoundEffects: SoundEffectsSingleton;

export function get_title() {
    return `${suit_emoji_str(Suit.DIAMOND)} Lyn Rummy ${suit_emoji_str(Suit.HEART)}`;
}

function set_title() {
    document.title = get_title();
}

// This is the entry point for static/index.html
export function gui() {
    set_title();
    const container = document.body;
    const deck_cards = build_full_double_deck();
    const webxdc = {
        selfAddr: "standalone",
        sendUpdate(_update: Update) {},
        setUpdateListener(_callback: UpdateListener) {},
    };

    const event_rows: EventRow[] = [];
    start_game(deck_cards, container, webxdc, event_rows, "Susan", "Lyn");
}

export function start_game(
    deck_cards: Card[],
    container: HTMLElement,
    webxdc: WebXdc,
    event_rows: EventRow[],
    player1_name: string,
    player2_name: string,
) {
    TheDeck = new Deck(deck_cards);
    DragDropHelper = new DragDropHelperSingleton();
    Popup = new PopupSingleton();
    SoundEffects = new SoundEffectsSingleton();
    StatusBar = new StatusBarSingleton();
    EventManager = new EventManagerSingleton();
    TheGame = new Game();
    CurrentBoard = initial_board();
    GameEventTracker = new GameEventTrackerSingleton(webxdc);
    PlayerGroup = new PlayerGroupSingleton([player1_name, player2_name]);
    ActivePlayer.start_turn();
    new MainGamePage(container);

    const json_game_events = event_rows.map(
        (event_row) => event_row.json_game_event,
    );
    GameEventTracker.handle_initial_events(json_game_events);

    function listener(update: Update): void {
        const event_row = update.payload as EventRow;

        console.log("addrs", event_row.addr, webxdc.selfAddr);

        if (event_row.addr !== webxdc.selfAddr) {
            GameEventTracker.handle_event(event_row.json_game_event);
        }
    }

    webxdc.setUpdateListener(listener);
}

function assert(
    condition: boolean,
    msg = "Assertion failed",
): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}
