// Rank a stubborn-card puzzle's board stacks by stack_viability,
// from the perspective of the stubborn card.

import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str } from "./card";
import { CardStackType, get_stack_type, value_distance } from "./stack_type";
import { can_merge, stack_viability } from "./viability";

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

// Same as pretty_card but appends ":1" or ":2" so the deck is
// visible. Used wherever we need to identify a physical card.
function pretty_card_deck(c: Card): string {
    const d = (c.origin_deck as number) === 0 ? "1" : "2";
    return pretty_card(c) + ":" + d;
}

// Can `card` be politely stolen from `stack`? "Polite" = the
// source stack remains a valid 3+ family (or shrinks to <= 2,
// which was never valid in the first place).
function polite_steal_status(stack: Card[], card: Card): string {
    const len = stack.length;
    if (len <= 2) return "polite";
    const t = get_stack_type(stack);
    const idx = stack.indexOf(card);
    if (idx < 0) return "?";

    if (t === CardStackType.SET) {
        return len >= 4 ? "polite" : "BREAKS STACK";
    }
    // PURE_RUN or RED_BLACK_RUN
    if (idx === 0 || idx === len - 1) {
        return len >= 4 ? "polite (end peel)" : "BREAKS STACK";
    }
    const left_len = idx;
    const right_len = len - idx - 1;
    return (left_len >= 3 && right_len >= 3)
        ? "polite (middle split)"
        : "BREAKS STACK";
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
// This doesn't change anything in viability.ts; it just narrates
// what the function did so we can spot-check tuning.
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
        // Mirrors the viability function: every card contributes,
        // viable cards at raw distance and non-viable cards at
        // distance + 1. We surface both the effective distance and
        // whether the winner was a strict-viable or soft pick.
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

type StubbornPuzzle = {
    name: string;
    source: string;
    stubborn_card: string;
    notes: string;
    total_cards: number;
    board_stacks: number;
    hand_size: number;
    board: { cards: string[]; type: string; score: number }[];
    hand: string[];
    expert_score: number;
};

const puzzles: StubbornPuzzle[] = JSON.parse(
    fs.readFileSync("src/lyn_rummy/stubborn_card_puzzles.json", "utf-8"),
);

// Try to assemble any valid 3-card stack that contains the target,
// drawing the other two cards from the supplied pool. Returns the
// distinct valid triples found (in canonical stack order).
function find_triples_with_target(
    target: Card, pool: Card[],
): Card[][] {
    const valid: Card[][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
            const a = target;
            const b = pool[i];
            const c = pool[j];
            if (b === target || c === target) continue;
            const orderings: Card[][] = [
                [a, b, c], [a, c, b],
                [b, a, c], [b, c, a],
                [c, a, b], [c, b, a],
            ];
            for (const ord of orderings) {
                const t = get_stack_type(ord);
                if (
                    t === CardStackType.PURE_RUN ||
                    t === CardStackType.SET ||
                    t === CardStackType.RED_BLACK_RUN
                ) {
                    const key = ord.map((c2) =>
                        c2.value + ":" + c2.suit + ":" + c2.origin_deck
                    ).join("|");
                    if (!seen.has(key)) {
                        seen.add(key);
                        valid.push(ord);
                    }
                    break;
                }
            }
        }
    }
    return valid;
}

const TOP_N = 3;

for (const p of puzzles) {
    console.log(`Puzzle: ${p.name}`);
    console.log(`Source: ${p.source}`);
    console.log(`Stubborn card: ${p.stubborn_card}`);
    console.log();

    const target = parse_card(p.stubborn_card);

    const ranked = p.board.map((s, i) => {
        const stack = s.cards.map(parse_card);
        return {
            orig_idx: i + 1,
            stack,
            viability: stack_viability(target, stack),
            type: get_stack_type(stack),
            reason: explain(target, stack),
        };
    });

    ranked.sort((a, b) => b.viability - a.viability);

    console.log("Stacks ranked by viability (highest first):");
    console.log();
    console.log("  Rank  Score  Type        Reason                       Cards");
    console.log("  " + "-".repeat(78));
    let rank = 0;
    for (const r of ranked) {
        rank++;
        const cards_str = r.stack.map(pretty_card).join(" ");
        console.log(
            "  " + String(rank).padStart(4) + "  " +
            String(r.viability).padStart(5) + "  " +
            pretty_type(r.type).padEnd(10) + "  " +
            r.reason.padEnd(28) + " " +
            cards_str
        );
    }
    console.log();

    // --- Top-N hypothesis test ---
    //
    // Claim: most of the time you can introduce the stubborn card
    // using only cards drawn from the top N most-viable stacks.
    // Enumerate every valid 3-card stack containing the target
    // whose other two cards live entirely within those top stacks.
    const top = ranked.slice(0, TOP_N);
    const pool: Card[] = [];
    // Map each pool card back to its source stack so we can
    // grade the steal politeness of each candidate triple.
    const source_of = new Map<Card, Card[]>();
    for (const r of top) {
        for (const c of r.stack) {
            pool.push(c);
            source_of.set(c, r.stack);
        }
    }

    console.log(`Top-${TOP_N} hypothesis test (target = ${pretty_card_deck(target)}):`);
    console.log(`  Pool: ${pool.map(pretty_card_deck).join(" ")}`);
    console.log();

    const triples = find_triples_with_target(target, pool);
    if (triples.length === 0) {
        console.log(`  -> NO valid triple containing ${pretty_card_deck(target)} `
            + `can be assembled from the top ${TOP_N} stacks.`);
    } else {
        console.log(`  Found ${triples.length} valid triple(s):`);
        for (const t of triples) {
            const tt = get_stack_type(t);
            const labels = t.map(pretty_card_deck).join(" ");
            console.log(`    [${labels}]   (${pretty_type(tt)})`);
            // Grade each non-target card's steal politeness.
            let any_breaks = false;
            for (const c of t) {
                if (c === target) {
                    console.log(`      ${pretty_card_deck(c)}: hand (free)`);
                    continue;
                }
                const stack = source_of.get(c);
                if (!stack) {
                    console.log(`      ${pretty_card_deck(c)}: ?`);
                    continue;
                }
                const status = polite_steal_status(stack, c);
                if (status === "BREAKS STACK") any_breaks = true;
                console.log(
                    `      ${pretty_card_deck(c)}: ${status} ` +
                    `(from [${stack.map(pretty_card_deck).join(" ")}])`
                );
            }
            console.log(`      => ${any_breaks ? "LOSSY" : "polite"}`);
        }
        console.log();
        const polite_triples = triples.filter((t) => {
            for (const c of t) {
                if (c === target) continue;
                const stack = source_of.get(c);
                if (!stack) return false;
                if (polite_steal_status(stack, c) === "BREAKS STACK") return false;
            }
            return true;
        });
        if (polite_triples.length > 0) {
            console.log(`  -> ${pretty_card_deck(target)} can be politely placed `
                + `from top ${TOP_N} (${polite_triples.length} polite triple(s)).`);
        } else {
            console.log(`  -> ${pretty_card_deck(target)} can be placed from top ${TOP_N}, `
                + `but only LOSSILY (every triple breaks at least one source stack).`);
        }
    }
    console.log();
}
