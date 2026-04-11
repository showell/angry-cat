// Stubborn Card Puzzle workflow.
//
// Walks the 15 hand_size == 1 puzzles from orphan_puzzles.json in
// ascending total_cards order. For the puzzle at CURRENT_INDEX,
// prints the working-list overview and the viability report so we
// can reason about the puzzle together as a team.
//
// To advance to the next puzzle, edit CURRENT_INDEX below and re-run.

import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import { CardStackType, get_stack_type, value_distance } from "../core/stack_type";
import { can_merge, stack_viability } from "./viability";

// ============================================================
// Tunable: which puzzle in the sorted list to present.
// 0 = smallest hand_size==1 puzzle. Increment to walk forward.
// ============================================================
const CURRENT_INDEX = 8;

// --- formatting helpers ---

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

const SUIT_LABELS: Record<Suit, string> = {
    [Suit.CLUB]: "C",
    [Suit.DIAMOND]: "D",
    [Suit.SPADE]: "S",
    [Suit.HEART]: "H",
};

function pretty_card(c: Card): string {
    return value_str(c.value) + SUIT_LABELS[c.suit as Suit];
}
function pretty_card_deck(c: Card): string {
    const d = (c.origin_deck as number) === 0 ? "1" : "2";
    return pretty_card(c) + ":" + d;
}
function pretty_type(t: CardStackType): string {
    switch (t) {
        case CardStackType.PURE_RUN: return "pure run";
        case CardStackType.SET: return "set";
        case CardStackType.RED_BLACK_RUN: return "rb run";
        case CardStackType.INCOMPLETE: return "incomplete";
        case CardStackType.BOGUS: return "bogus";
        case CardStackType.DUP: return "dup";
    }
}

// Re-derive a one-line "why" so the report is self-explanatory.
// Mirrors the math in viability.ts so the reason matches the score.
function explain(target: Card, stack: Card[]): string {
    if (can_merge(target, stack)) return "merges";

    const reasons: string[] = [];
    for (const c of stack) {
        if (c.value === target.value && c.suit === target.suit) {
            reasons.push("dup -30");
            break;
        }
    }

    const t = get_stack_type(stack);
    if (t === CardStackType.SET) {
        const d = value_distance(target.value, stack[0].value);
        reasons.push(`set dist ${d}, -${d * d * d}`);
    } else if (
        t === CardStackType.PURE_RUN ||
        t === CardStackType.RED_BLACK_RUN
    ) {
        let nearest_eff: number | undefined;
        let winner_was_viable = false;
        for (const c of stack) {
            if (c.value === target.value) continue;
            const d = value_distance(target.value, c.value);
            const same_color = c.color === target.color;
            const same_suit = c.suit === target.suit;
            const viable = same_suit || ((d % 2 === 0) === same_color);
            const eff = viable ? d : d + 1;
            if (nearest_eff === undefined || eff < nearest_eff) {
                nearest_eff = eff;
                winner_was_viable = viable;
            }
        }
        if (nearest_eff !== undefined) {
            const tag = winner_was_viable ? "viable" : "soft";
            reasons.push(
                `run nearest eff ${nearest_eff} (${tag}), -${nearest_eff * nearest_eff}`
            );
        }
    }

    if (reasons.length === 0) return "(no penalties triggered)";
    return reasons.join("; ");
}

// --- types ---

type Puzzle = {
    total_cards: number;
    board_stacks: number;
    hand_size: number;
    board: { cards: string[]; type: string; score: number }[];
    hand: string[];
    expert_score: number;
};

type WorklistEntry = {
    orig_index: number;     // 1-based, matches benchmark output
    total_cards: number;
    hand_card: string;
    puzzle: Puzzle;
};

// --- load + filter + sort ---

const all_puzzles: Puzzle[] = JSON.parse(
    fs.readFileSync("src/lyn_rummy/orphan_puzzles.json", "utf-8"),
);

const worklist: WorklistEntry[] = all_puzzles
    .map((p, i) => ({
        orig_index: i + 1,
        total_cards: p.total_cards,
        hand_card: p.hand[0],
        puzzle: p,
    }))
    .filter((e) => e.puzzle.hand_size === 1)
    .sort((a, b) => a.total_cards - b.total_cards);

// --- print the working list ---

console.log(`Working list: ${worklist.length} stubborn puzzles `
    + `(hand_size == 1, sorted by total_cards)`);
console.log();
console.log("  Slot  Orig#  Cards  Hand");
console.log("  " + "-".repeat(30));
worklist.forEach((e, i) => {
    const marker = i === CURRENT_INDEX ? "  <-- current" : "";
    console.log(
        "  " + String(i).padStart(4) + "  " +
        String(e.orig_index).padStart(5) + "  " +
        String(e.total_cards).padStart(5) + "  " +
        e.hand_card.padEnd(8) + marker
    );
});
console.log();

// --- present the current puzzle ---

const current = worklist[CURRENT_INDEX];
const p = current.puzzle;

console.log("=".repeat(60));
console.log(`Slot ${CURRENT_INDEX}: orig puzzle ${current.orig_index}, `
    + `${p.total_cards} cards, hand = [${p.hand.join(", ")}]`);
console.log("=".repeat(60));
console.log();

const target = parse_card(p.hand[0]);

const ranked = p.board.map((s) => {
    const stack = s.cards.map(parse_card);
    return {
        stack,
        viability: stack_viability(target, stack),
        type: get_stack_type(stack),
        reason: explain(target, stack),
    };
});

ranked.sort((a, b) => b.viability - a.viability);

console.log(`Stacks ranked by viability for ${pretty_card_deck(target)}:`);
console.log();
console.log("  Rank  Score  Type        Reason                              Cards");
console.log("  " + "-".repeat(85));
let rank = 0;
for (const r of ranked) {
    rank++;
    const cards_str = r.stack.map(pretty_card_deck).join(" ");
    console.log(
        "  " + String(rank).padStart(4) + "  " +
        String(r.viability).padStart(5) + "  " +
        pretty_type(r.type).padEnd(10) + "  " +
        r.reason.padEnd(34) + "  " +
        cards_str
    );
}
console.log();
