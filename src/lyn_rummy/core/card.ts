export enum CardValue {
    ACE = 1,
    TWO = 2,
    THREE = 3,
    FOUR = 4,
    FIVE = 5,
    SIX = 6,
    SEVEN = 7,
    EIGHT = 8,
    NINE = 9,
    TEN = 10,
    JACK = 11,
    QUEEN = 12,
    KING = 13,
}

export enum OriginDeck {
    DECK_ONE,
    DECK_TWO,
}

export enum Suit {
    CLUB = 0,
    DIAMOND = 1,
    SPADE = 2,
    HEART = 3,
}

export enum CardColor {
    BLACK = 0,
    RED = 1,
}

export type JsonCard = {
    value: CardValue;
    suit: Suit;
    origin_deck: OriginDeck;
};

export function is_pair_of_dups(card1: Card, card2: Card): boolean {
    // In a two-deck game, two cards can be both be
    // the Ace of Hearts, to use an example,
    // but you can't put dups in a set.
    return card1.value === card2.value && card1.suit === card2.suit;
}

// Canonical (parser-friendly) string for a card value. Tens are
// always "T" so labels are fixed-width and round-trip with Card.from.
// For player-facing UI, use value_display_str instead.
export function value_str(val: CardValue): string {
    switch (val) {
        case CardValue.ACE:
            return "A";
        case CardValue.TWO:
            return "2";
        case CardValue.THREE:
            return "3";
        case CardValue.FOUR:
            return "4";
        case CardValue.FIVE:
            return "5";
        case CardValue.SIX:
            return "6";
        case CardValue.SEVEN:
            return "7";
        case CardValue.EIGHT:
            return "8";
        case CardValue.NINE:
            return "9";
        case CardValue.TEN:
            return "T";
        case CardValue.JACK:
            return "J";
        case CardValue.QUEEN:
            return "Q";
        case CardValue.KING:
            return "K";
    }
}

// Player-facing display: tens render as "10". Use this only for
// UI rendering — code paths that need to round-trip should use
// value_str (which returns "T").
export function value_display_str(val: CardValue): string {
    if (val === CardValue.TEN) return "10";
    return value_str(val);
}

function value_for(label: string): CardValue {
    if (label === "10") {
        throw new Error("use T for ten");
    }

    switch (label) {
        case "A":
            return CardValue.ACE;
        case "2":
            return CardValue.TWO;
        case "3":
            return CardValue.THREE;
        case "4":
            return CardValue.FOUR;
        case "5":
            return CardValue.FIVE;
        case "6":
            return CardValue.SIX;
        case "7":
            return CardValue.SEVEN;
        case "8":
            return CardValue.EIGHT;
        case "9":
            return CardValue.NINE;
        case "T":
            return CardValue.TEN;
        case "J":
            return CardValue.JACK;
        case "Q":
            return CardValue.QUEEN;
        case "K":
            return CardValue.KING;
    }
    throw new Error("Invalid label");
}

export function suit_emoji_str(suit: Suit): string {
    // The strange numbers here refer to the Unicode
    // code points for the built-in emojis for the
    // suits.
    switch (suit) {
        case Suit.CLUB:
            return "\u2663";
        case Suit.DIAMOND:
            return "\u2666";
        case Suit.HEART:
            return "\u2665";
        case Suit.SPADE:
            return "\u2660";
    }
}

function suit_for(label: string): Suit {
    switch (label) {
        case "C":
            return Suit.CLUB;
        case "D":
            return Suit.DIAMOND;
        case "H":
            return Suit.HEART;
        case "S":
            return Suit.SPADE;
    }
    throw new Error("Invalid Suit label");
}

function card_color(suit: Suit): CardColor {
    switch (suit) {
        case Suit.CLUB:
        case Suit.SPADE:
            return CardColor.BLACK;
        case Suit.DIAMOND:
        case Suit.HEART:
            return CardColor.RED;
    }
}

// Do this the non-fancy way.
export const all_suits = [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB];

const all_card_values = [
    CardValue.ACE,
    CardValue.TWO,
    CardValue.THREE,
    CardValue.FOUR,
    CardValue.FIVE,
    CardValue.SIX,
    CardValue.SEVEN,
    CardValue.EIGHT,
    CardValue.NINE,
    CardValue.TEN,
    CardValue.JACK,
    CardValue.QUEEN,
    CardValue.KING,
];

export class Card {
    suit: Suit;
    value: CardValue;
    color: CardColor;
    origin_deck: OriginDeck;

    constructor(value: CardValue, suit: Suit, origin_deck: OriginDeck) {
        this.value = value;
        this.suit = suit;
        this.origin_deck = origin_deck;
        this.color = card_color(suit);
    }

    toJSON(): JsonCard {
        return {
            value: this.value,
            suit: this.suit,
            origin_deck: this.origin_deck,
        };
    }

    static from_json(json_card: JsonCard): Card {
        return new Card(json_card.value, json_card.suit, json_card.origin_deck);
    }

    clone(): Card {
        return new Card(this.value, this.suit, this.origin_deck);
    }

    str(): string {
        return value_str(this.value) + suit_emoji_str(this.suit);
    }

    equals(other_card: Card): boolean {
        return (
            this.value === other_card.value &&
            this.suit === other_card.suit &&
            this.origin_deck === other_card.origin_deck
        );
    }

    static from(label: string, origin_deck: OriginDeck): Card {
        const value = value_for(label[0]);
        const suit = suit_for(label[1]);
        return new Card(value, suit, origin_deck);
    }
}

function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        // Pick a random index from 0 to i
        const j = Math.floor(Math.random() * (i + 1));

        // Swap elements at i and j
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function build_full_double_deck(): Card[] {
    // Returns a shuffled deck of 2 packs of normal cards.

    function suit_run(suit: Suit, origin_deck: OriginDeck) {
        return all_card_values.map(
            (card_value) => new Card(card_value, suit, origin_deck),
        );
    }

    const all_runs1 = all_suits.map((suit) =>
        suit_run(suit, OriginDeck.DECK_ONE),
    );
    const all_runs2 = all_suits.map((suit) =>
        suit_run(suit, OriginDeck.DECK_TWO),
    );

    // 2 decks
    const all_runs = [...all_runs1, ...all_runs2];

    // Use the old-school idiom to flatten the array.
    const all_cards = all_runs.reduce((acc, lst) => acc.concat(lst));

    return shuffle(all_cards);
}
