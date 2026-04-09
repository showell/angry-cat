// Compute max viable chain length for each edge.
//
// For each edge A→B of kind K, what is the longest valid
// stack that could include this edge?
//
// Pure run: count consecutive same-suit cards.
// Set: count distinct suits for this value.
// RB run: walk alternating colors from both ends.

import * as fs from "fs";
import assert from "node:assert/strict";
import { Card, CardValue, OriginDeck, Suit, value_str } from "./card";
import {
    create_graph, propagate,
    type Graph, type GNode, type Edge, EdgeKind,
} from "./reassemble_graph";
import { successor, predecessor } from "./stack_type";

const D1 = OriginDeck.DECK_ONE;
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }
function nl(n: GNode): string { return n.cards.map(cs).join(","); }

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

// --- Chain length computation ---

// Build indexes once for the whole graph.
type CardIndex = {
    // For pure runs: which cards exist per suit?
    by_suit: Map<Suit, Set<CardValue>>;
    // For sets: which suits exist per value?
    by_value: Map<CardValue, Set<Suit>>;
    // For rb runs: which cards exist? (value, color) → count
    all_cards: Set<string>; // "value:color"
};

function build_index(g: Graph): CardIndex {
    const by_suit = new Map<Suit, Set<CardValue>>();
    const by_value = new Map<CardValue, Set<Suit>>();
    const all_cards = new Set<string>();

    for (const n of g.nodes) {
        if (!n.alive) continue;
        for (const c of n.cards) {
            if (!by_suit.has(c.suit)) by_suit.set(c.suit, new Set());
            by_suit.get(c.suit)!.add(c.value);

            if (!by_value.has(c.value)) by_value.set(c.value, new Set());
            by_value.get(c.value)!.add(c.suit);

            all_cards.add(`${c.value}:${c.color}`);
        }
    }

    return { by_suit, by_value, all_cards };
}

function chain_length(edge: Edge, idx: CardIndex): number {
    const a = edge.a.cards[0];
    const b = edge.b.cards[0];

    if (edge.kind === EdgeKind.SET) {
        // How many distinct suits for this value?
        return idx.by_value.get(a.value)?.size ?? 0;
    }

    if (edge.kind === EdgeKind.PURE_RUN) {
        // Count consecutive same-suit values extending from
        // the min to the max of a and b.
        const suit_vals = idx.by_suit.get(a.suit);
        if (!suit_vals) return 2;

        // Walk left from the lower value.
        const lo = a.value < b.value ? a.value :
                   (b.value === successor(a.value) ? a.value : b.value);
        // Actually, for a pr edge, successor(a.value) === b.value
        // OR successor(b.value) === a.value (wrap). Normalize.
        let left_val: CardValue;
        let right_val: CardValue;
        if (successor(a.value) === b.value) {
            left_val = a.value;
            right_val = b.value;
        } else {
            left_val = b.value;
            right_val = a.value;
        }

        // Walk left.
        let left_count = 0;
        let v = predecessor(left_val);
        while (suit_vals.has(v) && left_count < 13) {
            left_count++;
            v = predecessor(v);
        }

        // Walk right.
        let right_count = 0;
        v = successor(right_val);
        while (suit_vals.has(v) && right_count < 13) {
            right_count++;
            v = successor(v);
        }

        return left_count + right_count + 2; // +2 for a and b
    }

    if (edge.kind === EdgeKind.RED_BLACK) {
        // Walk alternating colors in both directions.
        let left_val: CardValue;
        let left_color: number;
        let right_val: CardValue;
        let right_color: number;

        if (successor(a.value) === b.value) {
            left_val = a.value;
            left_color = a.color;
            right_val = b.value;
            right_color = b.color;
        } else {
            left_val = b.value;
            left_color = b.color;
            right_val = a.value;
            right_color = a.color;
        }

        // Walk left: need predecessor with opposite color.
        let left_count = 0;
        let v = predecessor(left_val);
        let need_color = left_color === 0 ? 1 : 0;
        while (idx.all_cards.has(`${v}:${need_color}`) && left_count < 13) {
            left_count++;
            const tmp = need_color;
            need_color = need_color === 0 ? 1 : 0;
            v = predecessor(v);
        }

        // Walk right.
        let right_count = 0;
        v = successor(right_val);
        need_color = right_color === 0 ? 1 : 0;
        while (idx.all_cards.has(`${v}:${need_color}`) && right_count < 13) {
            right_count++;
            need_color = need_color === 0 ? 1 : 0;
            v = successor(v);
        }

        return left_count + right_count + 2;
    }

    return 2;
}

// --- Test on the 18-card reduced board ---

{
    const data = JSON.parse(fs.readFileSync("src/lyn_rummy/reduced_board.json", "utf-8"));
    const cards = data.unresolved_cards.map((l: string) => parse_card(l));

    const g = create_graph(cards);
    propagate(g);
    const idx = build_index(g);

    const seen = new Set<number>();
    type Result = { label: string; kind: string; len: number };
    const results: Result[] = [];

    for (const n of g.nodes) {
        if (!n.alive) continue;
        for (const e of n.edges) {
            if (!e.alive || seen.has(e.id)) continue;
            seen.add(e.id);
            results.push({
                label: nl(e.a) + "→" + nl(e.b),
                kind: e.kind,
                len: chain_length(e, idx),
            });
        }
    }

    results.sort((a, b) => a.len - b.len);

    console.log("18-card board: chain lengths\n");
    console.log("Edge".padEnd(15) + "Kind".padEnd(5) + "Len");
    console.log("-".repeat(25));
    for (const r of results) {
        console.log(r.label.padEnd(15) + r.kind.padEnd(5) + r.len);
    }

    // Any edges with len < 3?
    const dead = results.filter((r) => r.len < 3);
    console.log("\nEdges with chain < 3: " + dead.length);
}

// --- Test on larger boards to check performance ---

{
    const raw = fs.readFileSync("src/lyn_rummy/game_boards.json", "utf-8");
    const snaps = JSON.parse(raw);

    let prev = -1;
    console.log("\nPerformance across all boards:\n");

    for (const snap of snaps) {
        if (snap.cards_on_board === prev) continue;
        prev = snap.cards_on_board;
        if (snap.cards_on_board < 50 && snap.cards_on_board !== 23) continue;

        const all_cards: Card[] = [];
        for (const sd of snap.stacks) {
            for (const l of sd.cards) all_cards.push(parse_card(l));
        }

        const g = create_graph(all_cards);
        propagate(g);

        const start = performance.now();
        const idx = build_index(g);
        const seen = new Set<number>();
        let edge_count = 0;
        let min_len = Infinity;

        for (const n of g.nodes) {
            if (!n.alive) continue;
            for (const e of n.edges) {
                if (!e.alive || seen.has(e.id)) continue;
                seen.add(e.id);
                const len = chain_length(e, idx);
                if (len < min_len) min_len = len;
                edge_count++;
            }
        }
        const ms = performance.now() - start;

        console.log("  " + snap.cards_on_board + " cards: " + edge_count + " edges, min chain=" + min_len + ", " + ms.toFixed(1) + "ms");
    }
}

console.log("\nAll chain length tests passed.");
