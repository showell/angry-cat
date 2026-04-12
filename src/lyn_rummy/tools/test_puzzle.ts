// Show what plays the TrickBag proposes for a saved puzzle, and
// exercise the chosen play's executor to verify round-trip.

import * as fs from "fs";
import { Card, OriginDeck } from "../core/card";
import {
    CardStack, BoardCard, BoardCardState, HandCard, HandCardState,
} from "../core/card_stack";
import { TrickBag } from "../tricks/bag";
import { direct_play } from "../tricks/direct_play";
import { rb_swap } from "../tricks/rb_swap";
import { pair_peel } from "../tricks/pair_peel";
import { hand_stacks } from "../tricks/hand_stacks";

const BAG = new TrickBag([hand_stacks, direct_play, rb_swap, pair_peel]);

const path = process.argv[2];
if (!path) { console.error("Usage: test_puzzle.ts PATH"); process.exit(1); }

const puzzle = JSON.parse(fs.readFileSync(path, "utf-8"));

function parse_label(label: string): Card {
    const [cardPart, deckPart] = label.split(":");
    const deck = deckPart === "2" ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(cardPart, deck);
}

const hand_cards: HandCard[] = puzzle.hand.map((l: string) =>
    new HandCard(parse_label(l), HandCardState.NORMAL));

const board_stacks: CardStack[] = puzzle.board.map((s: any) => {
    const board_cards = s.cards.map((l: string) =>
        new BoardCard(parse_label(l), BoardCardState.FIRMLY_ON_BOARD));
    return new CardStack(board_cards, { top: 0, left: 0 });
});

console.log("Hand:", hand_cards.map(hc => hc.card.str()).join(" "));
console.log("Board:");
for (const s of board_stacks) {
    console.log("  [" + s.board_cards.map(bc => bc.card.str()).join(" ") + "]");
}

const all_plays = BAG.find_all_plays(hand_cards, board_stacks);
console.log(`\nAll plays found across the bag: ${all_plays.length}`);
for (const p of all_plays) {
    console.log(`  [${p.trick.id}] ${p.hand_cards.map(hc => hc.card.str()).join("+")}`);
}

const picked = BAG.first_play(hand_cards, board_stacks);
if (!picked) {
    console.log("\nNo trick fires on this puzzle.");
    process.exit(0);
}
console.log(`\nFirst play: [${picked.trick.id}] ${picked.trick.description}`);
console.log(`Hand cards: ${picked.hand_cards.map(hc => hc.card.str()).join(" ")}`);

const board_clone = board_stacks.map(s => s.clone());
const played = picked.apply(board_clone);
if (played.length === 0) {
    console.log("\nExecutor returned NO played cards — detector/executor drift!");
} else {
    console.log(`\nExecutor played ${played.length} card(s): ${played.map(hc => hc.card.str()).join(" ")}`);
    console.log("Resulting board:");
    for (const s of board_clone) {
        console.log("  [" + s.board_cards.map(bc => bc.card.str()).join(" ") + "]");
    }
}
