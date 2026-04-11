// Tests for the mechanics of collapsing two nodes along an edge.
//
// When we merge A and B along a pure-run edge:
// 1. A and B die. A new node [A,B] is born, locked to PURE_RUN.
// 2. ALL old edges on A and B are killed.
// 3. New edges are built from [A,B] to every other alive node.
//    Only edges compatible with [A,B]'s locked kind survive.
// 4. Neighbors that lost edges may become orphans or new leaves.
//
// We test these mechanics in isolation — no propagation loop,
// just one merge at a time.

import assert from "node:assert/strict";
import { Card, OriginDeck, Suit, value_str } from "../core/card";
import {
    create_graph, merge_along, kill_edge,
    type Graph, type GNode, type Edge, EdgeKind,
} from "../hints/reassemble_graph";

const D1 = OriginDeck.DECK_ONE;
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }

function node_label(n: GNode): string {
    return n.cards.map(cs).join(",");
}

function alive_edges(n: GNode): Edge[] {
    return n.edges.filter((e) => e.alive);
}

function find_node(g: Graph, label: string): GNode {
    for (const n of g.nodes) {
        if (n.alive && node_label(n) === label) return n;
    }
    throw new Error(`Node ${label} not found`);
}

function find_edge(a: GNode, b: GNode, kind: EdgeKind): Edge {
    for (const e of a.edges) {
        if (!e.alive) continue;
        if (e.kind !== kind) continue;
        const other = e.a === a ? e.b : e.a;
        if (other === b) return e;
    }
    throw new Error(`Edge ${node_label(a)}→${node_label(b)} (${kind}) not found`);
}

function dump(g: Graph): void {
    for (const n of g.nodes) {
        if (!n.alive) continue;
        const edges = alive_edges(n);
        const desc = edges.map((e) => {
            const other = e.a === n ? e.b : e.a;
            return node_label(other) + "(" + e.kind + ")";
        }).join(", ");
        console.log("    " + node_label(n) + " [" + edges.length + "]: " + desc);
    }
}

// --- Case 1: Merge two cards into a pure run. ---
//
// Cards: 3H, 4H, 4S.
// Before: 3H→4H (pr), 3H→4S (rb), 4H→4S (set).
// Merge 3H→4H as pr.
// After: [3H,4H] locked=pr. It should have NO edge to 4S
// (4S can't extend a hearts pure run). 4S becomes orphan.
{
    const g = create_graph([
        Card.from("3H", D1), Card.from("4H", D1), Card.from("4S", D1),
    ]);

    const n3h = find_node(g, "3H");
    const n4h = find_node(g, "4H");
    const n4s = find_node(g, "4S");
    const edge = find_edge(n3h, n4h, EdgeKind.PURE_RUN);

    assert.equal(alive_edges(n4s).length, 2, "4S starts with 2 edges");

    const merged = merge_along(g, edge);

    assert.equal(node_label(merged), "3H,4H");
    assert.equal(merged.locked_kind, EdgeKind.PURE_RUN);
    assert.equal(n3h.alive, false);
    assert.equal(n4h.alive, false);
    assert.equal(alive_edges(merged).length, 0, "[3H,4H] has no edge to 4S");
    assert.equal(alive_edges(n4s).length, 0, "4S is orphaned");
    console.log("  Case 1: merge pr, unrelated neighbor orphaned ✓");
}

// --- Case 2: Merge preserves compatible edges. ---
//
// Cards: 3H, 4H, 5H.
// Before: 3H→4H (pr), 4H→5H (pr).
// Merge 3H→4H as pr.
// After: [3H,4H] locked=pr should have edge to 5H (pr).
{
    const g = create_graph([
        Card.from("3H", D1), Card.from("4H", D1), Card.from("5H", D1),
    ]);

    const n3h = find_node(g, "3H");
    const n4h = find_node(g, "4H");
    const edge = find_edge(n3h, n4h, EdgeKind.PURE_RUN);

    const merged = merge_along(g, edge);

    assert.equal(alive_edges(merged).length, 1);
    const remaining_edge = alive_edges(merged)[0];
    const other = remaining_edge.a === merged ? remaining_edge.b : remaining_edge.a;
    assert.equal(node_label(other), "5H");
    assert.equal(remaining_edge.kind, EdgeKind.PURE_RUN);
    console.log("  Case 2: merge pr, compatible neighbor keeps edge ✓");
}

// --- Case 3: Merge as set, run edges on merged node die. ---
//
// Cards: 4H, 4S, 4D, 5H.
// Before: 4H→4S (set), 4H→4D (set), 4S→4D (set),
//         4H→5H (pr), 4S→5H (rb).
// Merge 4H→4S as set.
// After: [4H,4S] locked=set. Edge to 4D (set) survives.
// Edge to 5H should NOT exist (5H can't join a set of 4s...
// actually wait, 5H has value 5, the set has value 4. So yes,
// no edge). But check that 5H's edges to the OLD nodes died.
{
    const g = create_graph([
        Card.from("4H", D1), Card.from("4S", D1),
        Card.from("4D", D1), Card.from("5H", D1),
    ]);

    const n4h = find_node(g, "4H");
    const n4s = find_node(g, "4S");
    const n4d = find_node(g, "4D");
    const n5h = find_node(g, "5H");
    const edge = find_edge(n4h, n4s, EdgeKind.SET);

    assert(alive_edges(n5h).length >= 2, "5H starts with edges");

    const merged = merge_along(g, edge);

    assert.equal(merged.locked_kind, EdgeKind.SET);
    // [4H,4S] should connect to 4D via set.
    const merged_edges = alive_edges(merged);
    assert.equal(merged_edges.length, 1);
    const target = merged_edges[0].a === merged ? merged_edges[0].b : merged_edges[0].a;
    assert.equal(node_label(target), "4D");
    assert.equal(merged_edges[0].kind, EdgeKind.SET);

    // 5H should have lost its edges to 4H and 4S (they're dead).
    // 5H might still have edges to other nodes, but to 4H/4S: no.
    assert.equal(alive_edges(n5h).length, 0, "5H orphaned");
    console.log("  Case 3: merge set, incompatible run neighbor orphaned ✓");
}

// --- Case 4: Wrap-around KS→AS pure run. ---
//
// Cards: KS, AS, 2S. KS→AS (pr), AS→2S (pr).
// Merge KS→AS. [KS,AS] locked=pr should have edge to 2S.
{
    const g = create_graph([
        Card.from("KS", D1), Card.from("AS", D1), Card.from("2S", D1),
    ]);

    const nks = find_node(g, "KS");
    const nas = find_node(g, "AS");
    const edge = find_edge(nks, nas, EdgeKind.PURE_RUN);

    const merged = merge_along(g, edge);

    const edges = alive_edges(merged);
    assert.equal(edges.length, 1, "[KS,AS] should have 1 edge to 2S");
    const other = edges[0].a === merged ? edges[0].b : edges[0].a;
    assert.equal(node_label(other), "2S");
    console.log("  Case 4: K→A wrap pure run, 2S edge preserved ✓");
}

// --- Case 5: Merge doesn't create dup edges. ---
//
// Cards: 3H:D1, 4H:D1, 3H:D2.
// 3H:D1→4H (pr). 3H:D2→4H (pr). Also 3H:D1→3H:D2 would be
// a dup (is_pair_of_dups), so no edge between them.
// Merge 3H:D1→4H as pr. [3H,4H] should NOT have a pr edge
// to 3H:D2 (3H:D2 is value 3, [3H,4H] wants value 2 on left
// or value 5 on right).
{
    const D2 = OriginDeck.DECK_TWO;
    const g = create_graph([
        Card.from("3H", D1), Card.from("4H", D1), Card.from("3H", D2),
    ]);

    const n3h1 = g.nodes.find((n) => n.alive && n.cards[0].value === 3 &&
        n.cards[0].origin_deck === D1)!;
    const n4h = find_node(g, "4H");
    const edge = find_edge(n3h1, n4h, EdgeKind.PURE_RUN);

    const merged = merge_along(g, edge);

    // 3H:D2 should have no edge to [3H,4H].
    const n3h2 = g.nodes.find((n) => n.alive && n.cards[0].value === 3 &&
        n.cards[0].origin_deck === D2)!;
    assert.equal(alive_edges(n3h2).length, 0, "3H:D2 orphaned");
    assert.equal(alive_edges(merged).length, 0, "[3H,4H] has no edge to 3H:D2");
    console.log("  Case 5: dup card correctly orphaned after merge ✓");
}

// --- Case 6: Merge rb run, verify kind lock. ---
//
// Cards: 3S, 4H, 5C. 3S(black)→4H(red) rb, 4H(red)→5C(black) rb.
// Merge 3S→4H as rb. [3S,4H] locked=rb should have edge to 5C.
{
    const g = create_graph([
        Card.from("3S", D1), Card.from("4H", D1), Card.from("5C", D1),
    ]);

    const n3s = find_node(g, "3S");
    const n4h = find_node(g, "4H");
    const edge = find_edge(n3s, n4h, EdgeKind.RED_BLACK);

    const merged = merge_along(g, edge);

    assert.equal(merged.locked_kind, EdgeKind.RED_BLACK);
    const edges = alive_edges(merged);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].kind, EdgeKind.RED_BLACK);
    console.log("  Case 6: merge rb, compatible rb neighbor survives ✓");
}

console.log("\nAll collapse tests passed.");
