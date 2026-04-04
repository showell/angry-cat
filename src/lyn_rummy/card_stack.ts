import { type JsonCard, Card, OriginDeck } from "./card";
import { CardStackType, get_stack_type } from "./stack_type";

export enum HandCardState {
    NORMAL,
    FRESHLY_DRAWN,
    BACK_FROM_BOARD,
}

export enum BoardCardState {
    FIRMLY_ON_BOARD,
    FRESHLY_PLAYED,
    FRESHLY_PLAYED_BY_LAST_PLAYER,
}

export type JsonHandCard = {
    card: JsonCard;
    state: HandCardState;
};

export type JsonBoardCard = {
    card: JsonCard;
    state: BoardCardState;
};

export type BoardLocation = {
    top: number;
    left: number;
};

export type JsonCardStack = {
    board_cards: JsonBoardCard[];
    loc: BoardLocation;
};

// Minimal interface so CardStack.pull_from_deck doesn't depend on the
// Deck singleton directly. Deck satisfies this structurally.
export type DeckRef = {
    pull_card_from_deck(card: Card): void;
};

// CARD_WIDTH is also used by the UI rendering code in game.ts.
export const CARD_WIDTH = 27;

export class HandCard {
    card: Card;
    state: HandCardState;

    constructor(card: Card, state: HandCardState) {
        this.card = card;
        this.state = state;
    }

    toJSON(): JsonHandCard {
        return {
            card: this.card,
            state: this.state,
        };
    }

    static from_json(json: JsonHandCard): HandCard {
        return new HandCard(Card.from_json(json.card), json.state);
    }

    clone(): HandCard {
        return new HandCard(this.card, this.state);
    }

    str(): string {
        return this.card.str();
    }
}

export class BoardCard {
    card: Card;
    state: BoardCardState;

    constructor(card: Card, state: BoardCardState) {
        this.card = card;
        this.state = state;
    }

    toJSON(): JsonBoardCard {
        return {
            card: this.card,
            state: this.state,
        };
    }

    static from_json(json: JsonBoardCard): BoardCard {
        return new BoardCard(Card.from_json(json.card), json.state);
    }

    clone(): BoardCard {
        return new BoardCard(this.card, this.state);
    }

    str(): string {
        return this.card.str();
    }

    static aged_from_prior_turn(board_card: BoardCard): BoardCard {
        return new BoardCard(
            board_card.card,
            BoardCard.aged_state(board_card.state),
        );
    }

    static aged_state(state: BoardCardState): BoardCardState {
        switch (state) {
            case BoardCardState.FRESHLY_PLAYED_BY_LAST_PLAYER:
                return BoardCardState.FIRMLY_ON_BOARD;
            case BoardCardState.FRESHLY_PLAYED:
                return BoardCardState.FRESHLY_PLAYED_BY_LAST_PLAYER;
        }

        return state;
    }

    static pull_from_deck(
        label: string,
        origin_deck: OriginDeck,
        deck: DeckRef,
    ): BoardCard {
        const card = Card.from(label, origin_deck);
        deck.pull_card_from_deck(card);
        return new BoardCard(card, BoardCardState.FIRMLY_ON_BOARD);
    }

    static from_hand_card(hand_card: HandCard): BoardCard {
        return new BoardCard(hand_card.card, BoardCardState.FRESHLY_PLAYED);
    }
}

function locs_equal(loc1: BoardLocation, loc2: BoardLocation) {
    return loc1.top === loc2.top && loc1.left === loc2.left;
}

export class CardStack {
    board_cards: BoardCard[]; // Order does matter here!
    stack_type: CardStackType;
    loc: BoardLocation;

    constructor(board_cards: BoardCard[], loc: BoardLocation) {
        this.board_cards = board_cards;
        this.stack_type = this.get_stack_type();
        this.loc = loc;
    }

    toJSON(): JsonCardStack {
        return {
            board_cards: this.board_cards.map((board_card) =>
                board_card.toJSON(),
            ),
            loc: this.loc,
        };
    }

    static from_json(json: JsonCardStack): CardStack {
        return new CardStack(
            json.board_cards.map((board_card_json) =>
                BoardCard.from_json(board_card_json),
            ),
            json.loc,
        );
    }

    clone(): CardStack {
        const board_cards = this.board_cards.map((card) => card.clone());
        return new CardStack(board_cards, this.loc);
    }

    get_cards(): Card[] {
        return this.board_cards.map((board_card) => board_card.card);
    }

    size(): number {
        return this.board_cards.length;
    }

    get_stack_type(): CardStackType {
        // Use raw cards.
        return get_stack_type(this.get_cards());
    }

    str() {
        return this.board_cards.map((board_card) => board_card.str()).join(",");
    }

    equals(other_stack: CardStack) {
        // Cheat and compare strings.
        return (
            this.str() === other_stack.str() &&
            locs_equal(this.loc, other_stack.loc)
        );
    }

    incomplete(): boolean {
        return this.stack_type === CardStackType.INCOMPLETE;
    }

    problematic(): boolean {
        return (
            this.stack_type === CardStackType.BOGUS ||
            this.stack_type === CardStackType.DUP
        );
    }

    split(card_index: number): CardStack[] {
        const card_stack = this;
        const board_cards = card_stack.board_cards;

        // our caller already checks this
        if (board_cards.length === 1) {
            throw new Error("unexpected");
        }

        if (card_index + 1 <= board_cards.length / 2) {
            return this.left_split(card_index + 1);
        } else {
            return this.right_split(card_index);
        }
    }

    left_split(left_count: number): CardStack[] {
        const card_stack = this;
        const board_cards = card_stack.board_cards;

        const left_board_cards = board_cards.slice(0, left_count);
        const right_right_board_cards = board_cards.slice(left_count);

        const left_side_offset = -2;
        const right_side_offset = left_count * (CARD_WIDTH + 6) + 8;

        const left_loc = {
            top: card_stack.loc.top - 4,
            left: card_stack.loc.left + left_side_offset,
        };

        const right_loc = {
            top: card_stack.loc.top,
            left: card_stack.loc.left + right_side_offset,
        };

        return [
            new CardStack(left_board_cards, left_loc),
            new CardStack(right_right_board_cards, right_loc),
        ];
    }

    right_split(left_count: number): CardStack[] {
        const card_stack = this;
        const board_cards = card_stack.board_cards;

        const left_board_cards = board_cards.slice(0, left_count);
        const right_right_board_cards = board_cards.slice(left_count);

        const left_side_offset = -8;
        const right_side_offset = left_count * (CARD_WIDTH + 6) + 4;

        const left_loc = {
            top: card_stack.loc.top,
            left: card_stack.loc.left + left_side_offset,
        };

        const right_loc = {
            top: card_stack.loc.top - 4,
            left: card_stack.loc.left + right_side_offset,
        };

        return [
            new CardStack(left_board_cards, left_loc),
            new CardStack(right_right_board_cards, right_loc),
        ];
    }

    left_merge(other_stack: CardStack): CardStack | undefined {
        const loc = {
            left: this.loc.left - (CARD_WIDTH + 6) * other_stack.size(),
            top: this.loc.top,
        };

        return CardStack.maybe_merge(other_stack, this, loc);
    }

    right_merge(other_stack: CardStack): CardStack | undefined {
        const loc = {
            left: this.loc.left,
            top: this.loc.top,
        };

        return CardStack.maybe_merge(this, other_stack, loc);
    }

    static aged_from_prior_turn(card_stack: CardStack): CardStack {
        const board_cards = card_stack.board_cards;
        const new_board_cards = board_cards.map((board_card) => {
            return BoardCard.aged_from_prior_turn(board_card);
        });
        return new CardStack(new_board_cards, card_stack.loc);
    }

    static maybe_merge(
        s1: CardStack,
        s2: CardStack,
        loc: BoardLocation,
    ): CardStack | undefined {
        if (s1.equals(s2)) {
            // This is mostly to prevent us from literally trying
            // to merge our own stack on top of itself. But there's
            // also never a reason to merge two identical piles.
            // Sets don't allow duplicates, and we don't have room
            // in the UI for 26-card-long runs.
            return undefined;
        }

        const new_stack = new CardStack(
            [...s1.board_cards, ...s2.board_cards],
            loc,
        );
        if (new_stack.problematic()) {
            return undefined;
        }
        return new_stack;
    }

    static pull_from_deck(
        shorthand: string,
        origin_deck: OriginDeck,
        loc: BoardLocation,
        deck: DeckRef,
    ): CardStack {
        const card_labels = shorthand.split(",");
        const board_cards = card_labels.map((label) =>
            BoardCard.pull_from_deck(label, origin_deck, deck),
        );
        return new CardStack(board_cards, loc);
    }

    static from_hand_card(hand_card: HandCard, loc: BoardLocation): CardStack {
        const board_card = BoardCard.from_hand_card(hand_card);
        return new CardStack([board_card], loc);
    }
}
