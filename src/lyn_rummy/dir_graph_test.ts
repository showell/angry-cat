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

// --- Integration test: prune → leaf commit → update → prune cycle ---
//
// Board: 3H 4H 5H 6H 7H 7S 7D 7C 8S 9S
//
// PR edges: 3H→4H→5H→6H→7H (hearts run, len 5)
//           7S→8S→9S (spades, but 8S→9S is only len 2 without 10S)
//           Wait — 7S→8S is pr if same suit. Yes.
//
// Set edges: 7H↔7S↔7D↔7C (pool=4)
//
// RB edges: 6H→7S, 6H→7C (red→black), 7H→8S (red→black), etc.
//
// After initial chain prune: 8S→9S (pr) has chain len 2 if no 10S.
// Wait — 7S→8S→9S is len 3. And 8S→9S has bwd_reach to 7S = 1,
// so len = 1 + 0 + 2 = 3. OK that's fine.
//
// Let me pick cards where pruning actually cascades.
//
// Board: AH 2H 3H 4H 4S 4D
// PR: AH→2H→3H→4H (hearts, len 4)
// Set: 4H↔4S↔4D (pool=3, len 3)
// RB: 3H→4S, 3H→4D (red→black, but need 5-something for len 3)
//
// No pruning here. Let me add a dead end:
// Board: AH 2H 3H 4H 4S 4D 5C
// PR: AH→2H→3H→4H (len 4), 4C... wait no 4C isn't here.
// RB: 4H→5C (red→black), 4S→5C (black→black? no), 4D→5C (red→black).
// 5C has: incoming rb from 4H, 4D. Outgoing: nothing (no 6-anything).
// 5C→? needs value 6. No 6 exists. So 4H→5C (rb) has fwd=0.
// bwd of 4H→5C: walk back from 4H along rb... 3H→4D (rb? 3H is red,
// 4D is red — same color, NOT rb). 3H→4S (rb? 3H red, 4S black, yes!)
// So 3H→4S (rb) has chain: 2H→3H→4S→5C? No, 2H→3H is pr not rb.
// bwd from 3H along rb... 2H→3H is pr. No rb predecessor for 3H.
// So 3H→4S (rb) has bwd=0, fwd via 4S... 4S has no outgoing rb to 5C
// (4S black, 5C black — same color). So 3H→4S is len 2. Dead!
//
// This should prune 3H→4S, which leaves 4S with only set edges.
// If set pool for 4 is 3, 4S still has set edges to 4H and 4D.
// No cascade. Let me try harder.
//
// Simplest cascading case:
// KS AS 2S 3S 7H 7S 7D
// PR: KS→AS→2S→3S (spades, len 4 with wrap)
// Set: 7H↔7S↔7D (pool 3, len 3)
// RB: KS→AH? No AH. Let me check actual rb edges.
// KS(black)→AH would be rb but no AH.
// KS only has: pr to AS (wrap), set... KS value=13, only one K.
// So KS has 1 edge: KS→AS (pr). Degree 1 — it's a leaf!
// Commit KS→AS. [KS,AS] is locked to pr.
// Now AS is consumed. 7S has no pr edge to AS anymore.
// AS→2S was another edge — it's killed because AS merged.
// But wait, in this test we don't have the full merge machinery.
// Let me just test the prune-and-decrement cycle.

{
    console.log("\n--- Integration: prune→commit→update→prune ---\n");

    // 9 cards. Enough to have a mix of types.
    const cards = [
        Card.from("3H", D1), Card.from("4H", D1), Card.from("5H", D1),
        Card.from("6H", D1), Card.from("7H", D1),
        Card.from("7S", D1), Card.from("7D", D1), Card.from("7C", D1),
        Card.from("5C", D1),
    ];

    const g = build_dir_graph(cards);
    compute_all_reaches(g);

    const alive_count = () => g.edges.filter((e) => e.alive).length;
    const dead_count = () => g.edges.filter((e) => e.alive && chain_len(e) <= 2).length;

    console.log("  Initial: " + alive_count() + " edges, " + dead_count() + " dead");

    // Show all edges.
    for (const e of g.edges) {
        if (!e.alive) continue;
        console.log(`    ${cs(e.a)}→${cs(e.b)} (${e.kind}) bwd=${e.bwd_reach} fwd=${e.fwd_reach} len=${chain_len(e)}`);
    }

    // Prune loop: kill dead edges, update, repeat.
    let round = 0;
    let total_killed = 0;
    while (true) {
        const to_kill = g.edges.filter((e) => e.alive && chain_len(e) <= 2);
        if (to_kill.length === 0) break;
        round++;
        for (const e of to_kill) {
            console.log(`  Kill: ${cs(e.a)}→${cs(e.b)} (${e.kind}) len=${chain_len(e)}`);
            kill_edge(g, e);
        }
        total_killed += to_kill.length;
        console.log(`  Round ${round}: killed ${to_kill.length}, alive: ${alive_count()}`);
    }

    console.log("  Total killed: " + total_killed);
    console.log("  Surviving: " + alive_count() + " edges");

    // Show survivors.
    for (const e of g.edges) {
        if (!e.alive) continue;
        console.log(`    ${cs(e.a)}→${cs(e.b)} (${e.kind}) len=${chain_len(e)}`);
    }

    // Verify: no edge has chain_len ≤ 2.
    for (const e of g.edges) {
        if (e.alive) {
            assert(chain_len(e) >= 3, `${cs(e.a)}→${cs(e.b)} has len ${chain_len(e)}`);
        }
    }
    console.log("  All surviving edges have chain_len ≥ 3 ✓");
}

// --- Full cascade: prune → leaf commit → update → prune ---
//
// A "leaf" is a card with exactly one alive edge. It must commit
// to that edge. Committing kills all other edges on both cards,
// which triggers chain-length updates, which may kill more edges,
// which may create more leaves.

function card_degree(g: DirGraph, c: Card): number {
    const key = card_key(c);
    let count = 0;
    for (const e of g.outgoing.get(key) ?? []) { if (e.alive) count++; }
    for (const e of g.incoming.get(key) ?? []) { if (e.alive) count++; }
    return count;
}

// Would committing this edge orphan any neighbor?
// A neighbor is orphaned if ALL its edges go through A or B.
function commit_would_orphan(g: DirGraph, edge: DirEdge): boolean {
    const a_key = card_key(edge.a);
    const b_key = card_key(edge.b);

    // Collect all neighbors of A and B (excluding each other).
    const neighbor_keys = new Set<string>();
    for (const e of g.outgoing.get(a_key) ?? []) {
        if (e.alive && e !== edge) neighbor_keys.add(card_key(e.b));
    }
    for (const e of g.incoming.get(a_key) ?? []) {
        if (e.alive && e !== edge) neighbor_keys.add(card_key(e.a));
    }
    for (const e of g.outgoing.get(b_key) ?? []) {
        if (e.alive && e !== edge) neighbor_keys.add(card_key(e.b));
    }
    for (const e of g.incoming.get(b_key) ?? []) {
        if (e.alive && e !== edge) neighbor_keys.add(card_key(e.a));
    }
    neighbor_keys.delete(a_key);
    neighbor_keys.delete(b_key);

    // For each neighbor, count edges NOT going to A or B.
    for (const nk of neighbor_keys) {
        let surviving = 0;
        for (const e of g.outgoing.get(nk) ?? []) {
            if (!e.alive) continue;
            const ok = card_key(e.b);
            if (ok !== a_key && ok !== b_key) surviving++;
        }
        for (const e of g.incoming.get(nk) ?? []) {
            if (!e.alive) continue;
            const ok = card_key(e.a);
            if (ok !== a_key && ok !== b_key) surviving++;
        }
        // Also check: would the committed pair reconnect to this
        // neighbor? The pair is locked to edge.kind. If the neighbor
        // had a same-kind edge to A or B, the pair might rebuild it.
        if (surviving === 0) {
            let reconnects = false;
            for (const e of g.outgoing.get(nk) ?? []) {
                if (!e.alive) continue;
                const ok = card_key(e.b);
                if ((ok === a_key || ok === b_key) && e.kind === edge.kind) {
                    reconnects = true; break;
                }
            }
            if (!reconnects) {
                for (const e of g.incoming.get(nk) ?? []) {
                    if (!e.alive) continue;
                    const ok = card_key(e.a);
                    if ((ok === a_key || ok === b_key) && e.kind === edge.kind) {
                        reconnects = true; break;
                    }
                }
            }
            if (!reconnects) return true;
        }
    }
    return false;
}

function find_safe_leaf(g: DirGraph): DirEdge | undefined {
    for (const c of g.cards) {
        const key = card_key(c);
        const all_edges: DirEdge[] = [];
        for (const e of g.outgoing.get(key) ?? []) { if (e.alive) all_edges.push(e); }
        for (const e of g.incoming.get(key) ?? []) { if (e.alive) all_edges.push(e); }
        if (all_edges.length === 1) {
            const edge = all_edges[0];
            if (!commit_would_orphan(g, edge)) return edge;
        }
    }
    return undefined;
}

// Commit an edge: both cards are consumed. Kill all OTHER edges
// on both cards. For sets, remove both cards from the set pool.
function commit_edge(g: DirGraph, edge: DirEdge): void {
    // Mark the committed edge as dead — the cards are now consumed.
    edge.alive = false;

    const a_key = card_key(edge.a);
    const b_key = card_key(edge.b);

    // Kill all other edges on A.
    for (const e of g.outgoing.get(a_key) ?? []) {
        if (e.alive && e !== edge) kill_edge(g, e);
    }
    for (const e of g.incoming.get(a_key) ?? []) {
        if (e.alive && e !== edge) kill_edge(g, e);
    }

    // Kill all other edges on B.
    for (const e of g.outgoing.get(b_key) ?? []) {
        if (e.alive && e !== edge) kill_edge(g, e);
    }
    for (const e of g.incoming.get(b_key) ?? []) {
        if (e.alive && e !== edge) kill_edge(g, e);
    }

    // If committed to a non-set edge, remove both cards from set pools.
    if (edge.kind !== "set") {
        remove_from_set_pool(g, edge.a);
        remove_from_set_pool(g, edge.b);
    }
}

function safe_to_kill(g: DirGraph, edge: DirEdge): boolean {
    // Don't kill if it would orphan either endpoint.
    // An endpoint is orphaned if this is its last alive edge.
    if (card_degree(g, edge.a) <= 1) return false;
    if (card_degree(g, edge.b) <= 1) return false;
    return true;
}

function full_cascade(g: DirGraph): { pruned: number; committed: number } {
    let total_pruned = 0;
    let total_committed = 0;

    let iterations = 0;
    let progress = true;
    while (progress) {
        progress = false;
        iterations++;
        if (iterations > 10000) throw new Error("full_cascade exceeded 10000 iterations");

        // Prune edges with chain ≤ 2 (only if safe — won't orphan endpoints).
        {
            let killed_any = false;
            for (const e of g.edges) {
                if (!e.alive || chain_len(e) > 2) continue;
                if (safe_to_kill(g, e)) {
                    kill_edge(g, e);
                    total_pruned++;
                    killed_any = true;
                    break; // restart — killing may change other chain lengths
                }
            }
            if (killed_any) { progress = true; continue; }
        }

        // Commit leaves (only if safe — won't orphan neighbors).
        const leaf = find_safe_leaf(g);
        if (leaf) {
            commit_edge(g, leaf);
            total_committed++;
            progress = true;
            continue;
        }
    }

    return { pruned: total_pruned, committed: total_committed };
}

// --- Branching: speculatively commit edges on remaining graph ---
//
// After the cascade, pick an edge, clone the graph, commit it,
// run cascade on the clone. If it produces a better score than
// skipping that edge, keep it. Otherwise try the next edge.

function clone_dir_graph(g: DirGraph): DirGraph {
    // Deep copy edges, shallow copy card refs (cards are immutable).
    const new_edges = g.edges.map((e) => ({ ...e }));

    const outgoing = new Map<string, DirEdge[]>();
    const incoming = new Map<string, DirEdge[]>();
    for (const c of g.cards) {
        outgoing.set(card_key(c), []);
        incoming.set(card_key(c), []);
    }
    for (const e of new_edges) {
        outgoing.get(card_key(e.a))!.push(e);
        incoming.get(card_key(e.b))!.push(e);
    }

    return {
        cards: g.cards,
        edges: new_edges,
        outgoing,
        incoming,
        set_pool: new Map(g.set_pool),
    };
}

// Count committed cards (cards whose only alive edge is a committed one —
// actually, committed edges are marked dead. So committed cards have
// zero alive edges but were part of a commit. Track separately.)
type SolveResult = {
    committed_edges: { a: Card; b: Card; kind: string }[];
    orphans: Card[];
    remaining_edges: number;
};

function solve_with_branching(
    g: DirGraph,
    max_depth: number,
): SolveResult {
    // Run cascade first.
    const cascade_result = full_cascade(g);

    const committed: { a: Card; b: Card; kind: string }[] = [];
    const orphans: Card[] = [];

    // Collect committed pairs from the cascade.
    // (We don't track these yet — TODO. For now just count remaining.)

    const remaining = g.edges.filter((e) => e.alive).length;
    if (remaining === 0 || max_depth === 0) {
        // Count orphans.
        for (const c of g.cards) {
            if (card_degree(g, c) === 0) orphans.push(c);
        }
        return { committed_edges: committed, orphans, remaining_edges: remaining };
    }

    // Find a 3-card group to commit: two consecutive same-kind edges
    // A→B→C that form a valid 3-card stack. For sets, any 3 cards
    // of the same value with distinct suits.
    type Triple = { edges: [DirEdge, DirEdge]; cards: [Card, Card, Card] };

    function find_triples(): Triple[] {
        const triples: Triple[] = [];
        const seen = new Set<string>();

        for (const e1 of g.edges) {
            if (!e1.alive) continue;

            if (e1.kind === "set") {
                // For sets: find another set edge from B to a third card C.
                for (const e2 of g.outgoing.get(card_key(e1.b)) ?? []) {
                    if (!e2.alive || e2.kind !== "set") continue;
                    if (e2.b === e1.a) continue; // back to start
                    // Check distinct suits.
                    const suits = new Set([e1.a.suit, e1.b.suit, e2.b.suit]);
                    if (suits.size < 3) continue;
                    const key = [e1.a, e1.b, e2.b].map(card_key).sort().join("|");
                    if (seen.has(key)) continue;
                    seen.add(key);
                    triples.push({ edges: [e1, e2], cards: [e1.a, e1.b, e2.b] });
                }
            } else {
                // For runs: e1 is A→B. Find e2 = B→C of same kind.
                for (const e2 of g.outgoing.get(card_key(e1.b)) ?? []) {
                    if (!e2.alive || e2.kind !== e1.kind) continue;
                    if (e2.b === e1.a) continue;
                    const key = [e1.id, e2.id].sort().join("|");
                    if (seen.has(key)) continue;
                    seen.add(key);
                    triples.push({ edges: [e1, e2], cards: [e1.a, e1.b, e2.b] });
                }
                // Also: e1 is A→B. Find e0 where e0.b === A (predecessor).
                for (const e0 of g.incoming.get(card_key(e1.a)) ?? []) {
                    if (!e0.alive || e0.kind !== e1.kind) continue;
                    if (e0.a === e1.b) continue;
                    const key = [e0.id, e1.id].sort().join("|");
                    if (seen.has(key)) continue;
                    seen.add(key);
                    triples.push({ edges: [e0, e1], cards: [e0.a, e1.a, e1.b] });
                }
            }
        }

        return triples;
    }

    const triples = find_triples();
    if (triples.length === 0) {
        for (const c of g.cards) {
            if (card_degree(g, c) === 0) orphans.push(c);
        }
        return { committed_edges: committed, orphans, remaining_edges: remaining };
    }

    // Score triples: prefer the one on the most constrained cards.
    // Lower total degree of the 3 cards = more constrained = try first.
    triples.sort((a, b) => {
        const deg_a = a.cards.reduce((s, c) => s + card_degree(g, c), 0);
        const deg_b = b.cards.reduce((s, c) => s + card_degree(g, c), 0);
        return deg_a - deg_b;
    });

    const best_triple = triples[0];

    // Try committing this triple: kill all edges on all 3 cards.
    function commit_triple(g: DirGraph, t: Triple): void {
        for (const c of t.cards) {
            const key = card_key(c);
            for (const e of g.outgoing.get(key) ?? []) { if (e.alive) kill_edge(g, e); }
            for (const e of g.incoming.get(key) ?? []) { if (e.alive) kill_edge(g, e); }
            // Remove from set pool if committed to a run.
            if (t.edges[0].kind !== "set") {
                remove_from_set_pool(g, c);
            }
        }
    }

    const g_commit = clone_dir_graph(g);
    // Find the cloned triple edges.
    commit_triple(g_commit, {
        edges: [g_commit.edges[best_triple.edges[0].id], g_commit.edges[best_triple.edges[1].id]],
        cards: best_triple.cards,
    });
    const commit_result = solve_with_branching(g_commit, max_depth - 1);

    // Try skipping: kill the first edge of the triple.
    const g_skip = clone_dir_graph(g);
    kill_edge(g_skip, g_skip.edges[best_triple.edges[0].id]);
    const skip_result = solve_with_branching(g_skip, max_depth - 1);

    return commit_result.orphans.length <= skip_result.orphans.length
        ? commit_result : skip_result;
}

// Test branching on the 18-card reduced board.
{
    const data = JSON.parse(fs.readFileSync("src/lyn_rummy/reduced_board.json", "utf-8"));
    const cards = data.unresolved_cards.map((l: string) => parse_card(l));

    console.log("\n--- Branching on 18-card board ---\n");

    for (const depth of [0, 1, 2, 3, 5]) {
        const g = build_dir_graph(cards);
        compute_all_reaches(g);

        const start = performance.now();
        const result = solve_with_branching(g, depth);
        const ms = performance.now() - start;

        console.log(`  depth=${depth}: orphans=${result.orphans.length} remaining=${result.remaining_edges} ${ms.toFixed(0)}ms`);
    }
}

// --- Scale up: full cascade on all game boards ---

{
    const raw = fs.readFileSync("src/lyn_rummy/game_boards.json", "utf-8");
    const snaps = JSON.parse(raw);

    let prev_count = -1;
    console.log("\n--- Full cascade on all boards ---\n");
    console.log("Cards  Edges  Pruned  Committed  Surviving  Time");
    console.log("-----  -----  ------  ---------  ---------  ----");

    for (const snap of snaps) {
        if (snap.cards_on_board === prev_count) continue;
        prev_count = snap.cards_on_board;

        const cards: Card[] = [];
        for (const sd of snap.stacks) {
            for (const l of sd.cards) cards.push(parse_card(l));
        }

        const start = performance.now();
        const g = build_dir_graph(cards);
        compute_all_reaches(g);
        const result = full_cascade(g);
        const ms = performance.now() - start;
        if (ms > 2000) { console.log("SLOW at " + snap.cards_on_board + " cards (" + ms.toFixed(0) + "ms)"); }

        const surviving = g.edges.filter((e) => e.alive).length;

        // Check for orphans.
        let orphans = 0;
        for (const c of g.cards) {
            const key = card_key(c);
            let has = false;
            for (const e of g.outgoing.get(key) ?? []) { if (e.alive) { has = true; break; } }
            if (!has) { for (const e of g.incoming.get(key) ?? []) { if (e.alive) { has = true; break; } } }
            // Also check if this card was committed (part of a committed edge).
            // A committed card has exactly one alive edge — the committed one.
            // An orphan has zero alive edges.
            if (!has) orphans++;
        }

        const orphan_tag = orphans > 0 ? ` (${orphans} orphans)` : "";

        console.log(
            String(snap.cards_on_board).padStart(5) +
            String(g.edges.length).padStart(7) +
            String(result.pruned).padStart(8) +
            String(result.committed).padStart(11) +
            String(surviving).padStart(11) +
            (ms.toFixed(0) + "ms").padStart(7) +
            orphan_tag
        );
    }
}

console.log("\nAll dir graph tests passed.");
