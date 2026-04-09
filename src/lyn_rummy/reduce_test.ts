// Test the two-phase graph reduction:
//   Phase 1: Trim leaves (commit degree-1 nodes) until stable.
//   Phase 2: For each surviving edge, speculatively commit it.
//            If it creates an orphan, the edge is dead — kill it.
//            Killing edges may create new leaves → back to phase 1.
//   Repeat until neither phase makes progress.

import assert from "node:assert/strict";
import * as fs from "fs";
import { Card, OriginDeck, Suit, value_str } from "./card";
import {
    create_graph, propagate, clone_graph, merge_along,
    summarize, kill_edge,
    type Graph, type GNode, type Edge,
} from "./reassemble_graph";

const D1 = OriginDeck.DECK_ONE;
const sl: Record<Suit, string> = {
    [Suit.HEART]: "H", [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D", [Suit.CLUB]: "C",
};
function cs(c: Card): string { return value_str(c.value) + sl[c.suit]; }
function nl(n: GNode): string { return n.cards.map(cs).join(","); }

// --- Two-phase reduction ---

function alive_edges_list(g: Graph): Edge[] {
    const seen = new Set<number>();
    const result: Edge[] = [];
    for (const n of g.nodes) {
        if (!n.alive) continue;
        for (const e of n.edges) {
            if (e.alive && !seen.has(e.id)) {
                seen.add(e.id);
                result.push(e);
            }
        }
    }
    return result;
}

function has_orphan(g: Graph): boolean {
    for (const n of g.nodes) {
        if (!n.alive) continue;
        if (n.cards.length >= 3) continue;
        let has_edge = false;
        for (const e of n.edges) { if (e.alive) { has_edge = true; break; } }
        if (!has_edge) return true;
    }
    return false;
}

function phase1_trim_leaves(g: Graph): number {
    // Just run propagate — it already does leaf trimming.
    propagate(g);
    return 0; // propagate handles its own counting
}

// Try to kill ONE edge that creates an immediate-neighbor orphan.
// Returns true if an edge was killed. Caller should re-run phase 1
// before calling again.
function phase2_kill_one_orphan_edge(g: Graph): boolean {
    const edges = alive_edges_list(g);

    for (const edge of edges) {
        if (!edge.alive) continue;

        // Collect immediate neighbors of both endpoints.
        const neighbor_ids = new Set<number>();
        for (const e of edge.a.edges) {
            if (!e.alive) continue;
            const other = e.a === edge.a ? e.b : e.a;
            if (other !== edge.b) neighbor_ids.add(other.id);
        }
        for (const e of edge.b.edges) {
            if (!e.alive) continue;
            const other = e.a === edge.b ? e.b : e.a;
            if (other !== edge.a) neighbor_ids.add(other.id);
        }

        // Check DIRECTLY: does merging A+B (which kills all their
        // edges) leave any immediate neighbor with 0 alive edges?
        // No cloning, no propagation — just count.
        let neighbor_orphaned = false;
        for (const nid of neighbor_ids) {
            const neighbor = g.nodes.find((n) => n.id === nid)!;
            // Count this neighbor's alive edges that are NOT on A or B.
            let surviving = 0;
            for (const e of neighbor.edges) {
                if (!e.alive) continue;
                const other = e.a === neighbor ? e.b : e.a;
                if (other === edge.a || other === edge.b) continue;
                surviving++;
            }
            if (surviving === 0) { neighbor_orphaned = true; break; }
        }

        if (neighbor_orphaned) {
            console.log(`      Phase 2 kills: ${nl(edge.a)}→${nl(edge.b)} (${edge.kind})`);
            kill_edge(g, edge);
            return true;
        }
    }

    return false;
}

function validate_no_orphans(g: Graph, label: string): void {
    for (const n of g.nodes) {
        if (!n.alive) continue;
        if (n.cards.length >= 3) continue;
        let has = false;
        for (const e of n.edges) { if (e.alive) { has = true; break; } }
        if (!has) {
            throw new Error(`Orphan found after ${label}: ${n.cards.map(cs).join(",")}`);
        }
    }
}

function reduce(cards: Card[], verbose = false): Graph {
    const g = create_graph(cards);
    let round = 0;

    let progress = true;
    while (progress) {
        progress = false;
        round++;

        // Phase 1: trim leaves until stable.
        const before1 = summarize(g);
        phase1_trim_leaves(g);
        const after1 = summarize(g);
        if (after1.alive_edges < before1.alive_edges) {
            progress = true;
            if (verbose) console.log(`    Round ${round} phase1: ${before1.alive_edges} → ${after1.alive_edges} edges`);
            if (has_orphan(g)) {
                if (verbose) console.log("    *** ORPHAN after phase 1! ***");
                return g; // Stop — phase 1 created an orphan, which means
                          // a previous edge kill was wrong.
            }
        }

        // Phase 2: kill ONE edge that creates an immediate orphan,
        // then loop back to phase 1 to re-stabilize.
        if (phase2_kill_one_orphan_edge(g)) {
            progress = true;
            if (verbose) {
                const s = summarize(g);
                console.log(`    Round ${round} phase2: killed 1 edge, now ${s.alive_edges} edges`);
            }
            if (has_orphan(g)) {
                if (verbose) console.log("    *** ORPHAN after phase 2 kill! ***");
                return g;
            }
        }
    }

    return g;
}

// --- Test on the 18-card reduced board ---

{
    const data = JSON.parse(fs.readFileSync("src/lyn_rummy/reduced_board.json", "utf-8"));
    const cards = data.unresolved_cards.map((l: string) => Card.from(l.replace("10", "T"), D1));

    console.log("18-card reduced board:");
    console.log("  Input: " + cards.map(cs).join(", "));

    // Phase 1 only (baseline).
    {
        const g = create_graph(cards);
        propagate(g);
        const s = summarize(g);
        console.log("\n  Phase 1 only: " + s.alive_nodes + " nodes, " + s.alive_edges + " edges, score=" + s.score);
    }

    // Full two-phase reduction.
    {
        const g = reduce(cards, true);
        const s = summarize(g);
        console.log("  Two-phase:   " + s.alive_nodes + " nodes, " + s.alive_edges + " edges, score=" + s.score);

        // Show what's resolved and what's left.
        console.log("\n  Resolved groups:");
        for (const n of g.nodes) {
            if (!n.alive || n.cards.length < 3) continue;
            console.log("    [" + n.cards.map(cs).join(" ") + "] (" + n.locked_kind + ")");
        }

        const unresolved: string[] = [];
        for (const n of g.nodes) {
            if (!n.alive) continue;
            if (n.cards.length < 3) {
                for (const c of n.cards) unresolved.push(cs(c));
            }
        }
        if (unresolved.length > 0) {
            console.log("  Unresolved: " + unresolved.join(", "));
        }

        const orphans: string[] = [];
        for (const n of g.nodes) {
            if (!n.alive || n.cards.length >= 3) continue;
            let has = false;
            for (const e of n.edges) { if (e.alive) { has = true; break; } }
            if (!has) orphans.push(n.cards.map(cs).join(","));
        }
        if (orphans.length > 0) {
            console.log("  Orphans: " + orphans.join(", "));
        }
    }
}

// --- Test on a trivial case (should fully solve) ---

{
    const cards = [
        Card.from("3H", D1), Card.from("4H", D1), Card.from("5H", D1),
        Card.from("7S", D1), Card.from("8S", D1), Card.from("9S", D1),
    ];

    const g = reduce(cards);
    const s = summarize(g);

    assert.equal(s.unresolved_nodes, 0, "trivial case should fully resolve");
    assert.equal(s.score, 200, "two 3-card pure runs = 200");
    console.log("\n  Trivial 6-card case: SOLVED, score=" + s.score + " ✓");
}

// --- Test on the full 23-card board ---

{
    const raw = fs.readFileSync("src/lyn_rummy/game_boards.json", "utf-8");
    const snaps = JSON.parse(raw);
    const snap = snaps.find((s: any) => s.cards_on_board === 23);

    const all_cards: Card[] = [];
    for (const sd of snap.stacks) {
        for (const l of sd.cards) all_cards.push(Card.from(l.replace("10", "T"), D1));
    }

    const g = reduce(all_cards);
    const s = summarize(g);
    console.log("\n  23-card board: " + s.alive_nodes + " nodes, " + s.alive_edges + " edges, score=" + s.score);
    console.log("  Resolved: " + s.resolved_nodes + ", Unresolved: " + s.unresolved_nodes);
}

console.log("\nAll reduce tests passed.");
