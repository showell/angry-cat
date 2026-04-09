// Verify threesome enumeration on the canonical 19-card case.

import { Card, OriginDeck, Suit, value_str } from "./card";
import { CardStackType } from "./stack_type";
import { compute_threesomes } from "./threesomes";

const D1 = OriginDeck.DECK_ONE;

const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

const ALL_19 = [
    "TD", "JD", "QD", "KD",
    "2H", "3H", "4H",
    "7S", "7D", "7C",
    "AC", "AD", "AH",
    "2C", "3D", "4C", "5H", "6S", "7H",
];

const cards = ALL_19.map((l) => Card.from(l, D1));

const threesomes = compute_threesomes(cards);

// Print every card's threesomes.
console.log("Threesomes for the 19-card board:\n");
for (const card of cards) {
    const ts = threesomes.get(card)!;
    console.log(`${cs(card)} (${ts.length} threesomes):`);
    for (const t of ts) {
        const type_short = t.type === CardStackType.SET ? "set"
            : t.type === CardStackType.PURE_RUN ? "pr"
            : "rb";
        console.log(`  [${t.cards.map(cs).join(" ")}] (${type_short})`);
    }
    console.log();
}

// Sanity checks for a few key cards.
console.log("=== Sanity checks ===\n");

function find_card(label: string): Card {
    return cards.find((c) => cs(c) === label)!;
}

const ac = find_card("AC");
const ac_ts = threesomes.get(ac)!;
console.log(`AC has ${ac_ts.length} threesomes`);
const ac_set = ac_ts.find((t) => t.type === CardStackType.SET);
console.log(`AC's set: ${ac_set ? "[" + ac_set.cards.map(cs).join(" ") + "]" : "NONE"}`);

const td = find_card("TD");
const td_ts = threesomes.get(td)!;
const td_pr = td_ts.find((t) => t.type === CardStackType.PURE_RUN);
console.log(`TD has ${td_ts.length} threesomes; first pr: ${td_pr ? "[" + td_pr.cards.map(cs).join(" ") + "]" : "NONE"}`);

const seven_h = find_card("7H");
const seven_h_ts = threesomes.get(seven_h)!;
console.log(`7H has ${seven_h_ts.length} threesomes`);
