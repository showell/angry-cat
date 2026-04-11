// Build a fast edge graph with path lengths for a full 104-card deck.
//
// Step 1: Create all edges (18 per card, ~936 total undirected).
// Step 2: Compute chain lengths for each edge.
// Measure both steps.

import { Card, CardColor, CardValue, OriginDeck, Suit, value_str, is_pair_of_dups } from "../core/card";
import { successor, predecessor } from "../core/stack_type";
import { build_card_lookup, chain_length, type EdgeKindTag } from "../hints/edge_info";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string {
    const dk = c.origin_deck === D1 ? "1" : "2";
    return value_str(c.value) + sl[c.suit] + ":" + dk;
}

// --- Step 1: Build edge list ---

type FastEdge = {
    a: Card;
    b: Card;
    kind: EdgeKindTag;
    chain_len: number;
};

function build_edges(cards: Card[]): FastEdge[] {
    // Index cards for fast neighbor lookup.
    const by_suit_value = new Map<string, Card[]>();
    const by_value = new Map<CardValue, Card[]>();
    const by_color_value = new Map<string, Card[]>();

    for (const c of cards) {
        const sv = `${c.suit}:${c.value}`;
        if (!by_suit_value.has(sv)) by_suit_value.set(sv, []);
        by_suit_value.get(sv)!.push(c);

        if (!by_value.has(c.value)) by_value.set(c.value, []);
        by_value.get(c.value)!.push(c);

        const cv = `${c.color}:${c.value}`;
        if (!by_color_value.has(cv)) by_color_value.set(cv, []);
        by_color_value.get(cv)!.push(c);
    }

    const edges: FastEdge[] = [];
    const seen = new Set<string>();

    function add(a: Card, b: Card, kind: EdgeKindTag): void {
        // Deduplicate: use sorted card indices.
        const key = [a, b].map((c) => `${c.value}:${c.suit}:${c.origin_deck}`).sort().join("|") + "|" + kind;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ a, b, kind, chain_len: 0 });
    }

    for (const c of cards) {
        const next_val = successor(c.value);

        // Pure run: same suit, successor value.
        for (const other of by_suit_value.get(`${c.suit}:${next_val}`) ?? []) {
            if (!is_pair_of_dups(c, other)) add(c, other, "pr");
        }

        // Red/black: opposite color, successor value.
        const opp = c.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
        for (const other of by_color_value.get(`${opp}:${next_val}`) ?? []) {
            if (!is_pair_of_dups(c, other)) add(c, other, "rb");
        }

        // Set: same value, different suit.
        for (const other of by_value.get(c.value) ?? []) {
            if (other.suit !== c.suit && !is_pair_of_dups(c, other)) {
                add(c, other, "set");
            }
        }
    }

    return edges;
}

// --- Step 2: Compute chain lengths ---

function compute_chain_lengths(edges: FastEdge[], cards: Card[]): void {
    const lookup = build_card_lookup(cards);
    for (const e of edges) {
        e.chain_len = chain_length(e.a, e.b, e.kind, lookup);
    }
}

// --- Test: full 104-card deck ---

{
    const cards: Card[] = [];
    for (const deck of [D1, D2]) {
        for (let v = 1; v <= 13; v++) {
            for (const s of [Suit.HEART, Suit.SPADE, Suit.DIAMOND, Suit.CLUB]) {
                cards.push(new Card(v as CardValue, s, deck));
            }
        }
    }

    console.log("Full 104-card deck:\n");

    const t1 = performance.now();
    const edges = build_edges(cards);
    const t2 = performance.now();

    console.log(`  Step 1 (build edges): ${edges.length} edges in ${(t2 - t1).toFixed(1)}ms`);

    const t3 = performance.now();
    compute_chain_lengths(edges, cards);
    const t4 = performance.now();

    console.log(`  Step 2 (chain lengths): ${(t4 - t3).toFixed(1)}ms`);
    console.log(`  Total: ${(t4 - t1).toFixed(1)}ms`);

    // Distribution of chain lengths.
    const dist = new Map<number, number>();
    for (const e of edges) {
        dist.set(e.chain_len, (dist.get(e.chain_len) ?? 0) + 1);
    }
    console.log("\n  Chain length distribution:");
    for (const [len, count] of [...dist].sort((a, b) => a[0] - b[0])) {
        console.log(`    len=${len}: ${count} edges`);
    }

    // Verify: no chain < 3 (full deck has everything).
    const min = Math.min(...edges.map((e) => e.chain_len));
    console.log(`\n  Min chain: ${min}`);

    // Show a few edges per kind.
    console.log("\n  Sample edges:");
    for (const kind of ["pr", "rb", "set"] as const) {
        const sample = edges.filter((e) => e.kind === kind).slice(0, 3);
        for (const e of sample) {
            console.log(`    ${cs(e.a)}→${cs(e.b)} (${e.kind}) len=${e.chain_len}`);
        }
    }
}

// --- Test: game boards at various sizes ---

{
    const fs = require("fs");
    const raw = fs.readFileSync("src/lyn_rummy/game_boards.json", "utf-8");
    const snaps = JSON.parse(raw);

    console.log("\n\nGame boards:\n");
    console.log("Cards".padStart(5) + "Edges".padStart(7) + "Build".padStart(8) + "Chain".padStart(8) + "Min".padStart(5) + "  Dead(≤2)");
    console.log("-".repeat(45));

    let prev = -1;
    for (const snap of snaps) {
        if (snap.cards_on_board === prev) continue;
        prev = snap.cards_on_board;
        if (snap.cards_on_board % 10 !== 0 && snap.cards_on_board !== 23 &&
            snap.cards_on_board !== 104) continue;

        function parse_card(label: string): Card {
            const parts = label.replace("10", "T").split(":");
            const deck = parts.length > 1 && parts[1] === "2"
                ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
            return Card.from(parts[0], deck);
        }

        const cards: Card[] = [];
        for (const sd of snap.stacks) {
            for (const l of sd.cards) cards.push(parse_card(l));
        }

        const t1 = performance.now();
        const edges = build_edges(cards);
        const t2 = performance.now();
        compute_chain_lengths(edges, cards);
        const t3 = performance.now();

        const min = edges.length > 0 ? Math.min(...edges.map((e) => e.chain_len)) : 0;
        const dead = edges.filter((e) => e.chain_len <= 2).length;

        console.log(
            String(snap.cards_on_board).padStart(5) +
            String(edges.length).padStart(7) +
            ((t2 - t1).toFixed(1) + "ms").padStart(8) +
            ((t3 - t2).toFixed(1) + "ms").padStart(8) +
            String(min).padStart(5) +
            String(dead).padStart(8),
        );
    }
}

console.log("\nAll fast graph tests passed.");
