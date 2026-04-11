// A pre-shuffled double deck for deterministic simulation tests.
// Generated once from build_full_double_deck() and frozen so that
// simulations are reproducible across runs.
//
// Format: "ValueSuit:Deck" — e.g. "6C:1" = 6 of Clubs from Deck 1.
// Ten is "T" (internal format), not "10".

import { Card, OriginDeck } from "./card";

// Original shuffle output (with "10" labels) converted to "T" format:
const DECK_LABELS = [
    "6C:1","KS:2","TH:2","AS:1","5S:2","TD:1","3H:2","4H:2","KD:1","6H:1",
    "9S:2","7C:1","4S:1","TC:1","KH:1","KS:1","TC:2","4D:2","5C:1","3D:1",
    "4H:1","8S:1","9C:2","6C:2","6S:1","7S:2","6S:2","2H:2","QH:1","AC:2",
    "JH:2","TH:1","8S:2","AH:2","QH:2","6H:2","TS:2","QD:1","5D:2","AS:2",
    "5H:1","AD:2","3C:1","5C:2","6D:2","3D:2","JD:1","AD:1","9D:1","2C:2",
    "9D:2","JC:2","KD:2","7S:1","2H:1","QS:2","9C:1","7H:1","9H:1","2D:2",
    "JD:2","2C:1","6D:1","TS:1","2S:2","4D:1","JS:1","KH:2","4C:1","KC:1",
    "JS:2","2S:1","KC:2","QC:1","4S:2","8D:2","4C:2","8H:2","8H:1","AC:1",
    "JH:1","5H:2","9H:2","AH:1","TD:2","5S:1","3S:2","QD:2","7D:2","5D:1",
    "7C:2","QS:1","8C:2","QC:2","JC:1","7H:2","8D:1","7D:1","2D:1","9S:1",
    "8C:1","3C:2","3H:1","3S:1",
];

function parse_label(label: string): Card {
    const [card_part, deck_part] = label.split(":");
    const origin_deck = deck_part === "1" ? OriginDeck.DECK_ONE : OriginDeck.DECK_TWO;
    return Card.from(card_part, origin_deck);
}

export function get_test_deck(): Card[] {
    return DECK_LABELS.map(parse_label);
}
