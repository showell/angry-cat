// Directional edge graph with incrementally maintained chain lengths.
//
// Each edge is directional: A→B means successor(A.value) === B.value
// (for runs) or same value different suit (for sets).
//
// Chain length = how far you can walk forward from B + how far
// backward from A + 2 (for A and B themselves).
//
// When an edge dies, only edges in the same chain need updating.
// For runs: walk forward from B, each edge's backward reach shrinks.
//           Walk backward from A, each edge's forward reach shrinks.
// For sets: decrement the pool counter for that value.

import assert from "node:assert/strict";
import * as fs from "fs";
import { Card, CardColor, CardValue, OriginDeck, Suit, value_str, is_pair_of_dups } from "./card";
import { successor, predecessor } from "./stack_type";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

// --- Directional edge ---

type DirEdge = {
    id: number;
    a: Card;       // predecessor
    b: Card;       // successor
    kind: "pr" | "rb" | "set";
    alive: boolean;
    // Chain reaches: how many cards extend in each direction.
    fwd_reach: number;   // cards reachable forward from b
    bwd_reach: number;   // cards reachable backward from a
};

function chain_len(e: DirEdge): number {
    return e.fwd_reach + e.bwd_reach + 2;
}

// --- Graph ---

type DirGraph = {
    cards: Card[];
    edges: DirEdge[];
    // Index: for each card, its outgoing edges (card is A).
    outgoing: Map<string, DirEdge[]>;
    // Index: for each card, its incoming edges (card is B).
    incoming: Map<string, DirEdge[]>;
    // Set pool: count of alive cards per value.
    set_pool: Map<CardValue, number>;
};

function card_key(c: Card): string {
    return `${c.value}:${c.suit}:${c.origin_deck}`;
}

function build_dir_graph(cards: Card[]): DirGraph {
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

    const edges: DirEdge[] = [];
    const seen = new Set<string>();
    let next_id = 0;

    function add(a: Card, b: Card, kind: "pr" | "rb" | "set"): void {
        const key = card_key(a) + "|" + card_key(b) + "|" + kind;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push({ id: next_id++, a, b, kind, alive: true, fwd_reach: 0, bwd_reach: 0 });
    }

    for (const c of cards) {
        const nv = successor(c.value);

        // PR: same suit, successor.
        for (const o of by_suit_value.get(`${c.suit}:${nv}`) ?? []) {
            if (!is_pair_of_dups(c, o)) add(c, o, "pr");
        }

        // RB: opposite color, successor.
        const opp = c.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
        for (const o of by_color_value.get(`${opp}:${nv}`) ?? []) {
            if (!is_pair_of_dups(c, o)) add(c, o, "rb");
        }

        // Set: same value, different suit.
        for (const o of by_value.get(c.value) ?? []) {
            if (o.suit !== c.suit && !is_pair_of_dups(c, o)) add(c, o, "set");
        }
    }

    // Build indexes.
    const outgoing = new Map<string, DirEdge[]>();
    const incoming = new Map<string, DirEdge[]>();
    for (const c of cards) {
        outgoing.set(card_key(c), []);
        incoming.set(card_key(c), []);
    }
    for (const e of edges) {
        outgoing.get(card_key(e.a))!.push(e);
        incoming.get(card_key(e.b))!.push(e);
    }

    // Set pool counts.
    const set_pool = new Map<CardValue, number>();
    for (const c of cards) {
        set_pool.set(c.value, (set_pool.get(c.value) ?? 0) + 1);
    }

    return { cards, edges, outgoing, incoming, set_pool };
}

// --- Compute initial chain lengths ---

function compute_fwd_reach(e: DirEdge, g: DirGraph): number {
    // For sets, store the extra pool beyond the 2 cards in this edge.
    // But we split it: fwd gets the full extra, bwd gets 0.
    // chain_len = fwd + bwd + 2 = extra + 0 + 2 = pool.
    if (e.kind === "set") return Math.max(0, g.set_pool.get(e.a.value)! - 2);

    // Walk forward from b along same-kind outgoing edges.
    const visited = new Set<string>();
    visited.add(card_key(e.a));
    visited.add(card_key(e.b));
    let count = 0;
    let current = e.b;
    while (true) {
        let found: Card | undefined;
        for (const out of g.outgoing.get(card_key(current)) ?? []) {
            if (!out.alive || out.kind !== e.kind) continue;
            if (visited.has(card_key(out.b))) continue;
            found = out.b;
            break;
        }
        if (!found) break;
        visited.add(card_key(found));
        current = found;
        count++;
    }
    return count;
}

function compute_bwd_reach(e: DirEdge, g: DirGraph): number {
    // For sets, bwd gets 0. All extra is in fwd.
    if (e.kind === "set") return 0;

    // Walk backward from a along same-kind incoming edges.
    const visited = new Set<string>();
    visited.add(card_key(e.a));
    visited.add(card_key(e.b));
    let count = 0;
    let current = e.a;
    while (true) {
        let found: Card | undefined;
        for (const inc of g.incoming.get(card_key(current)) ?? []) {
            if (!inc.alive || inc.kind !== e.kind) continue;
            if (visited.has(card_key(inc.a))) continue;
            found = inc.a;
            break;
        }
        if (!found) break;
        visited.add(card_key(found));
        current = found;
        count++;
    }
    return count;
}

function compute_all_reaches(g: DirGraph): void {
    for (const e of g.edges) {
        if (!e.alive) continue;
        e.fwd_reach = compute_fwd_reach(e, g);
        e.bwd_reach = compute_bwd_reach(e, g);
    }
}

// --- Kill an edge and update affected chain lengths ---

// When a card is consumed by a run (committed to a non-set group),
// remove it from the set pool and update all set edges for that value.
function remove_from_set_pool(g: DirGraph, card: Card): void {
    const val = card.value;
    const count = g.set_pool.get(val);
    if (count === undefined) return;
    g.set_pool.set(val, count - 1);

    // Update fwd_reach on all alive set edges for this value.
    // chain_len = fwd_reach + 0 + 2 = pool.
    const new_pool = count - 1;
    for (const e of g.edges) {
        if (!e.alive || e.kind !== "set") continue;
        if (e.a.value !== val) continue;
        e.fwd_reach = Math.max(0, new_pool - 2);
        e.bwd_reach = 0;
    }

    // Also kill any set edge that directly involves this card.
    for (const e of g.edges) {
        if (!e.alive || e.kind !== "set") continue;
        const a_key = card_key(e.a);
        const b_key = card_key(e.b);
        const c_key = card_key(card);
        if (a_key === c_key || b_key === c_key) {
            kill_edge(g, e);
        }
    }
}

function kill_edge(g: DirGraph, edge: DirEdge): void {
    if (!edge.alive) return;
    edge.alive = false;

    if (edge.kind === "set") {
        // No chain walk needed — set reaches are driven by pool counter.
        return;
    }

    // Walk forward from b: each downstream edge loses backward reach
    // since it can no longer reach through the killed edge.
    {
        let current = edge.b;
        const visited = new Set<string>();
        visited.add(card_key(edge.a));
        visited.add(card_key(edge.b));
        while (true) {
            let next_edge: DirEdge | undefined;
            for (const out of g.outgoing.get(card_key(current)) ?? []) {
                if (!out.alive || out.kind !== edge.kind) continue;
                if (visited.has(card_key(out.b))) continue;
                next_edge = out;
                break;
            }
            if (!next_edge) break;
            // This edge's backward reach can't be longer than
            // the distance from here to edge.b.
            next_edge.bwd_reach = compute_bwd_reach(next_edge, g);
            visited.add(card_key(next_edge.b));
            current = next_edge.b;
        }
    }

    // Walk backward from a: each upstream edge loses forward reach.
    {
        let current = edge.a;
        const visited = new Set<string>();
        visited.add(card_key(edge.a));
        visited.add(card_key(edge.b));
        while (true) {
            let prev_edge: DirEdge | undefined;
            for (const inc of g.incoming.get(card_key(current)) ?? []) {
                if (!inc.alive || inc.kind !== edge.kind) continue;
                if (visited.has(card_key(inc.a))) continue;
                prev_edge = inc;
                break;
            }
            if (!prev_edge) break;
            prev_edge.fwd_reach = compute_fwd_reach(prev_edge, g);
            visited.add(card_key(prev_edge.a));
            current = prev_edge.a;
        }
    }
}

// --- Test: trivial case ---

function parse_card(label: string): Card {
    const parts = label.replace("10", "T").split(":");
    const deck = parts.length > 1 && parts[1] === "2"
        ? OriginDeck.DECK_TWO : OriginDeck.DECK_ONE;
    return Card.from(parts[0], deck);
}

{
    const cards = ["3H", "4H", "5H", "6H", "7H"].map((l) => Card.from(l, D1));
    const g = build_dir_graph(cards);
    compute_all_reaches(g);

    console.log("5-card hearts run:\n");
    for (const e of g.edges) {
        if (!e.alive || e.kind !== "pr") continue;
        console.log(`  ${cs(e.a)}→${cs(e.b)}: bwd=${e.bwd_reach} fwd=${e.fwd_reach} len=${chain_len(e)}`);
    }

    // All PR edges should have chain length 5.
    for (const e of g.edges) {
        if (e.alive && e.kind === "pr") {
            assert.equal(chain_len(e), 5, `${cs(e.a)}→${cs(e.b)} should be 5`);
        }
    }
    console.log("  All chain lengths = 5 ✓");

    // Kill 4H→5H and check updates.
    const killed = g.edges.find((e) => e.alive && e.kind === "pr" &&
        e.a.value === 4 && e.b.value === 5)!;
    kill_edge(g, killed);

    console.log("\n  After killing 4H→5H:");
    for (const e of g.edges) {
        if (!e.alive || e.kind !== "pr") continue;
        console.log(`  ${cs(e.a)}→${cs(e.b)}: bwd=${e.bwd_reach} fwd=${e.fwd_reach} len=${chain_len(e)}`);
    }

    // 3H→4H should now have fwd=0, len=2.
    const e34 = g.edges.find((e) => e.alive && e.kind === "pr" &&
        e.a.value === 3 && e.b.value === 4)!;
    assert.equal(chain_len(e34), 2, "3H→4H should be 2 after kill");

    // 5H→6H should now have bwd=0.
    const e56 = g.edges.find((e) => e.alive && e.kind === "pr" &&
        e.a.value === 5 && e.b.value === 6)!;
    assert.equal(e56.bwd_reach, 0, "5H→6H bwd should be 0");
    assert.equal(chain_len(e56), 3, "5H→6H→7H = 3");

    console.log("  Chain updates correct ✓");
}

// --- Test: 18-card reduced board ---

{
    const data = JSON.parse(fs.readFileSync("src/lyn_rummy/reduced_board.json", "utf-8"));
    const cards = data.unresolved_cards.map((l: string) => parse_card(l));

    const g = build_dir_graph(cards);
    compute_all_reaches(g);

    const alive = g.edges.filter((e) => e.alive);
    const dead_edges = alive.filter((e) => chain_len(e) <= 2);

    console.log("\n18-card board:");
    console.log(`  ${alive.length} edges, ${dead_edges.length} with chain ≤ 2`);

    if (dead_edges.length > 0) {
        console.log("  Dead edges:");
        for (const e of dead_edges) {
            console.log(`    ${cs(e.a)}→${cs(e.b)} (${e.kind}) len=${chain_len(e)}`);
        }
    }

    // Kill dead edges and see if more become dead.
    let round = 0;
    let total_killed = 0;
    while (true) {
        const to_kill = g.edges.filter((e) => e.alive && chain_len(e) <= 2);
        if (to_kill.length === 0) break;
        round++;
        for (const e of to_kill) kill_edge(g, e);
        total_killed += to_kill.length;
        console.log(`  Round ${round}: killed ${to_kill.length}, total alive: ${g.edges.filter(e => e.alive).length}`);
    }

    console.log(`  Total killed: ${total_killed}`);
    console.log(`  Surviving edges: ${g.edges.filter(e => e.alive).length}`);
}

// --- Test: set pool decrement ---
//
// 7H, 7S, 7D + 6H, 8H. The 7s form a 3-set (pool=3).
// 7H is also in a pure run [6H 7H 8H]. If 7H gets consumed
// by the run, the set pool drops to 2 and 7S→7D set edges die.
{
    const cards = [
        Card.from("7H", D1), Card.from("7S", D1), Card.from("7D", D1),
        Card.from("6H", D1), Card.from("8H", D1),
    ];
    const g = build_dir_graph(cards);
    compute_all_reaches(g);

    // Before: set pool for 7 = 3. Set edges have chain_len = 3.
    const set_edges_before = g.edges.filter((e) => e.alive && e.kind === "set");
    assert(set_edges_before.length > 0, "should have set edges");
    for (const e of set_edges_before) {
        assert.equal(chain_len(e), 3, `${cs(e.a)}→${cs(e.b)} set should be 3`);
    }
    console.log("\nSet pool test:");
    console.log("  Before: pool=3, set edges alive=" + set_edges_before.length);

    // Simulate: 7H is consumed by a run. Remove it from set pool.
    const card_7h = cards.find((c) => c.value === 7 && c.suit === Suit.HEART)!;
    remove_from_set_pool(g, card_7h);

    // Kill any edges that dropped to chain_len ≤ 2.
    for (const e of g.edges) {
        if (e.alive && chain_len(e) <= 2) kill_edge(g, e);
    }

    // After: pool = 2. All set edges for value 7 should be dead.
    const set_edges_after = g.edges.filter((e) => e.alive && e.kind === "set" && e.a.value === 7);
    assert.equal(set_edges_after.length, 0, "all set edges should be dead");
    assert.equal(g.set_pool.get(7 as CardValue), 2, "pool should be 2");
    console.log("  After removing 7H: pool=2, set edges alive=0 ✓");
}

// --- Test: set pool with 4 cards stays alive ---
{
    const cards = [
        Card.from("7H", D1), Card.from("7S", D1),
        Card.from("7D", D1), Card.from("7C", D1),
        Card.from("6H", D1), Card.from("8H", D1),
    ];
    const g = build_dir_graph(cards);
    compute_all_reaches(g);

    // Pool = 4. Remove 7H.
    const card_7h = cards.find((c) => c.value === 7 && c.suit === Suit.HEART)!;
    remove_from_set_pool(g, card_7h);

    // Pool = 3. Set edges NOT involving 7H should survive with chain_len = 3.
    const surviving = g.edges.filter((e) => e.alive && e.kind === "set" && e.a.value === 7);
    assert(surviving.length > 0, "some set edges should survive");
    for (const e of surviving) {
        assert.equal(chain_len(e), 3, `${cs(e.a)}→${cs(e.b)} should be 3`);
    }
    console.log("\n  4-card pool → remove one → pool=3, surviving set edges have len=3 ✓");
}

console.log("\nAll dir graph tests passed.");
