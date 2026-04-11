// Graph-based board reassembly via local constraint propagation.
//
// Philosophy: each card starts as a node with ~6 edges. Every
// operation KILLS edges. Killing an edge may leave a node with
// one neighbor → collapse it. Collapsing constrains the merged
// node's type → kill incompatible edges. Chain reaction.
//
// CORRECTNESS RULE: we only kill edges that are provably dead.
// An edge is dead if following it can NEVER lead to a valid 3+
// card stack. We never make scoring decisions — only prune
// impossibilities.

import { Card, CardColor, CardValue, Suit, is_pair_of_dups, value_str } from "../core/card";
import { CardStackType, get_stack_type, successor } from "../core/stack_type";

const suit_letter: Record<Suit, string> = {
    [Suit.HEART]: "H",
    [Suit.SPADE]: "S",
    [Suit.DIAMOND]: "D",
    [Suit.CLUB]: "C",
};

function card_label(c: Card): string {
    return value_str(c.value) + suit_letter[c.suit];
}

// --- Edge types ---

export enum EdgeKind {
    PURE_RUN = "pr",
    RED_BLACK = "rb",
    SET = "set",
}

// --- Edge and Node ---

export type Edge = {
    id: number;
    a: GNode;
    b: GNode;
    kind: EdgeKind;
    alive: boolean;
};

export type GNode = {
    id: number;
    cards: Card[];
    edges: Edge[];       // array for fast iteration
    alive: boolean;
    locked_kind: EdgeKind | undefined;
};

function left_card(n: GNode): Card { return n.cards[0]; }
function right_card(n: GNode): Card { return n.cards[n.cards.length - 1]; }

// --- Graph ---

export type Graph = {
    nodes: GNode[];
    next_node_id: number;
    next_edge_id: number;
    dirty: GNode[];          // work queue (array, not Set, for speed)
    dirty_set: Set<number>;  // track what's in the queue
    // Precomputed: for each value, how many alive single-card
    // nodes with distinct suits are available for sets.
    set_feasible: Map<CardValue, number>;
    stats: { merges: number; pruned: number };
};

function mark_dirty(g: Graph, node: GNode): void {
    if (node.alive && !g.dirty_set.has(node.id)) {
        g.dirty.push(node);
        g.dirty_set.add(node.id);
    }
}

// --- Graph construction ---

export function create_graph(cards: Card[]): Graph {
    const nodes: GNode[] = cards.map((c, i) => ({
        id: i,
        cards: [c],
        edges: [],
        alive: true,
        locked_kind: undefined,
    }));

    const g: Graph = {
        nodes,
        next_node_id: cards.length,
        next_edge_id: 0,
        dirty: [],
        dirty_set: new Set(),
        set_feasible: new Map(),
        stats: { merges: 0, pruned: 0 },
    };

    // Build set_feasible index.
    recount_set_feasibility(g);

    // Build initial edges using indexes for O(n) instead of O(n²).
    // Each card connects to: same-suit ±1 value (pure run),
    // opposite-color ±1 value (red/black), same-value diff suit (set).
    const by_suit_value = new Map<string, GNode[]>();
    const by_value = new Map<CardValue, GNode[]>();
    const by_color_value = new Map<string, GNode[]>();

    for (const n of nodes) {
        const c = n.cards[0];
        const sv = `${c.suit}:${c.value}`;
        if (!by_suit_value.has(sv)) by_suit_value.set(sv, []);
        by_suit_value.get(sv)!.push(n);

        if (!by_value.has(c.value)) by_value.set(c.value, []);
        by_value.get(c.value)!.push(n);

        const cv = `${c.color}:${c.value}`;
        if (!by_color_value.has(cv)) by_color_value.set(cv, []);
        by_color_value.get(cv)!.push(n);
    }

    for (const n of nodes) {
        const c = n.cards[0];
        const next_val = successor(c.value);

        // Pure run: same suit, next value.
        const pr_key = `${c.suit}:${next_val}`;
        for (const other of by_suit_value.get(pr_key) ?? []) {
            if (other !== n) add_edge(g, n, other, EdgeKind.PURE_RUN);
        }

        // Red/black: opposite color, next value.
        const opp_color = c.color === CardColor.RED ? CardColor.BLACK : CardColor.RED;
        const rb_key = `${opp_color}:${next_val}`;
        for (const other of by_color_value.get(rb_key) ?? []) {
            if (other !== n && !is_pair_of_dups(c, other.cards[0])) {
                add_edge(g, n, other, EdgeKind.RED_BLACK);
            }
        }

        // Set: same value, different suit.
        for (const other of by_value.get(c.value) ?? []) {
            if (other !== n && other.cards[0].suit !== c.suit && !is_pair_of_dups(c, other.cards[0])) {
                add_edge(g, n, other, EdgeKind.SET);
            }
        }
    }

    // All nodes start dirty.
    for (const n of nodes) mark_dirty(g, n);

    return g;
}

function recount_set_feasibility(g: Graph): void {
    // Full recount. Called once at init and after merges.
    // With 104 cards this is ~104 iterations — fast enough.
    g.set_feasible.clear();
    const by_val = new Map<CardValue, Set<Suit>>();
    for (let i = 0; i < g.nodes.length; i++) {
        const n = g.nodes[i];
        if (!n.alive || n.cards.length !== 1) continue;
        if (n.locked_kind !== undefined && n.locked_kind !== EdgeKind.SET) continue;
        const c = n.cards[0];
        let s = by_val.get(c.value);
        if (!s) { s = new Set(); by_val.set(c.value, s); }
        s.add(c.suit);
    }
    for (const [val, suits] of by_val) {
        g.set_feasible.set(val, suits.size);
    }
}

// --- Edge creation ---

function try_add_edges(g: Graph, a: GNode, b: GNode): void {
    const ar = right_card(a);
    const bl = left_card(b);
    const br = right_card(b);
    const al = left_card(a);

    // a's right → b's left
    check_and_add(g, a, b, ar, bl);
    // b's right → a's left
    check_and_add(g, b, a, br, al);
}

function check_and_add(g: Graph, left: GNode, right: GNode, lc: Card, rc: Card): void {
    // Pure run: same suit, consecutive.
    if (lc.suit === rc.suit && rc.value === successor(lc.value)) {
        if (kind_ok(left, EdgeKind.PURE_RUN) && kind_ok(right, EdgeKind.PURE_RUN)) {
            if (!has_dup(left, right)) {
                add_edge(g, left, right, EdgeKind.PURE_RUN);
            }
        }
    }

    // Red/black: opposite color, consecutive.
    if (lc.color !== rc.color && rc.value === successor(lc.value)) {
        if (kind_ok(left, EdgeKind.RED_BLACK) && kind_ok(right, EdgeKind.RED_BLACK)) {
            if (!has_dup(left, right)) {
                add_edge(g, left, right, EdgeKind.RED_BLACK);
            }
        }
    }

    // Set: same value, different suit, combined ≤ 4.
    if (lc.value === rc.value && lc.suit !== rc.suit) {
        if (kind_ok(left, EdgeKind.SET) && kind_ok(right, EdgeKind.SET)) {
            if (!has_dup(left, right) && left.cards.length + right.cards.length <= 4) {
                add_edge(g, left, right, EdgeKind.SET);
            }
        }
    }
}

function kind_ok(node: GNode, kind: EdgeKind): boolean {
    return node.locked_kind === undefined || node.locked_kind === kind;
}

function has_dup(a: GNode, b: GNode): boolean {
    for (const ac of a.cards) {
        for (const bc of b.cards) {
            if (is_pair_of_dups(ac, bc)) return true;
        }
    }
    return false;
}

function add_edge(g: Graph, a: GNode, b: GNode, kind: EdgeKind): void {
    // Check for duplicate.
    for (const e of a.edges) {
        if (e.alive && e.kind === kind) {
            if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return;
        }
    }
    const edge: Edge = { id: g.next_edge_id++, a, b, kind, alive: true };
    a.edges.push(edge);
    b.edges.push(edge);
}

// --- Kill an edge (the fundamental operation) ---

export function kill_edge(g: Graph, edge: Edge): void {
    if (!edge.alive) return;
    edge.alive = false;
    g.stats.pruned++;
    mark_dirty(g, edge.a);
    mark_dirty(g, edge.b);
}

// --- Merge two nodes (only when provably forced) ---

export function merge_along(g: Graph, edge: Edge): GNode {
    const a = edge.a;
    const b = edge.b;
    const cards = [...a.cards, ...b.cards];

    const new_node: GNode = {
        id: g.next_node_id++,
        cards,
        edges: [],
        alive: true,
        locked_kind: edge.kind,
    };

    // Kill ALL edges on both old nodes.
    for (const e of a.edges) kill_edge(g, e);
    for (const e of b.edges) kill_edge(g, e);
    a.alive = false;
    b.alive = false;

    g.nodes.push(new_node);
    g.stats.merges++;

    // Build edges from new_node to all other alive nodes.
    // Don't skip "orphans" here — a node with 0 edges might gain
    // new edges from this very merge (e.g., 4th card joining a set).
    for (const other of g.nodes) {
        if (!other.alive || other === new_node) continue;
        try_add_edges(g, new_node, other);
    }

    mark_dirty(g, new_node);
    recount_set_feasibility(g);
    return new_node;
}

// --- Propagation: process dirty queue ---
//
// Each rule either kills an edge or does nothing. A merge only
// happens when a node has exactly one edge AND the merge is forced
// (the card has no alternative and the result is already 3+ cards).
//
// RULES (all provably correct):
//
// 1. LOCKED_KIND_KILL: If node is locked to kind K, kill all
//    edges of other kinds. (Locked means committed — other kinds
//    are impossible.)
//
// 2. DEAD_PAIR_KILL: If edge A→B would produce a 2-card pair
//    that has no same-kind neighbor on either side, the pair can
//    never reach 3. Kill the edge.
//
// 3. ONLY_KIND_LOCK: If all of a node's alive edges are the same
//    kind, lock the node. (It has no alternative kind.) This
//    enables rule 1 to fire on the next pass.
//
// 4. SET_INFEASIBLE_KILL: If a set edge connects cards of value V,
//    but fewer than 3 distinct suits of value V are available for
//    sets, kill it. (Can't form a set without 3 suits.)
//
// 5. FORCED_MERGE: If a node has exactly 1 alive edge and merging
//    produces 3+ cards, merge. (The node has no alternative, and
//    the result is a valid stack.)

// Would merging along this edge orphan any of the neighbor's
// other connections? Checks directly without cloning — counts
// how many edges each neighbor-of-neighbor would retain.
function merge_would_orphan_neighbor(g: Graph, edge: Edge): boolean {
    const a = edge.a;
    const b = edge.b;

    // Collect all nodes connected to a or b (excluding a and b).
    const neighbor_ids = new Set<number>();
    for (const e of a.edges) {
        if (!e.alive) continue;
        const other = e.a === a ? e.b : e.a;
        if (other !== b) neighbor_ids.add(other.id);
    }
    for (const e of b.edges) {
        if (!e.alive) continue;
        const other = e.a === b ? e.b : e.a;
        if (other !== a) neighbor_ids.add(other.id);
    }

    // For each neighbor, check if it would be orphaned.
    // A neighbor survives if it either:
    //   (a) has edges to nodes other than a and b, OR
    //   (b) would connect to the merged [a,b] node (same kind as
    //       the merge edge, since the merged node is locked to that kind).
    for (const nid of neighbor_ids) {
        const neighbor = g.nodes.find((n) => n.id === nid)!;

        // Check (a): edges to other nodes.
        let has_other_edge = false;
        for (const e of neighbor.edges) {
            if (!e.alive) continue;
            const other = e.a === neighbor ? e.b : e.a;
            if (other === a || other === b) continue;
            has_other_edge = true;
            break;
        }
        if (has_other_edge) continue;

        // Check (b): would the merged node reconnect to this neighbor?
        // The merged node is locked to edge.kind. The neighbor must
        // have had an edge of that kind to a or b.
        let reconnects = false;
        for (const e of neighbor.edges) {
            if (!e.alive) continue;
            const other = e.a === neighbor ? e.b : e.a;
            if ((other === a || other === b) && e.kind === edge.kind) {
                reconnects = true;
                break;
            }
        }
        if (reconnects) continue;

        // Neither (a) nor (b): this neighbor would be orphaned.
        return true;
    }

    return false;
}

export function propagate(g: Graph): void {
    while (g.dirty.length > 0) {
        const node = g.dirty.pop()!;
        g.dirty_set.delete(node.id);

        if (!node.alive) continue;

        // Compact dead edges.
        let edge_count = 0;
        for (let i = 0; i < node.edges.length; i++) {
            const e = node.edges[i];
            if (e.alive && e.a.alive && e.b.alive) {
                node.edges[edge_count++] = e;
            }
        }
        node.edges.length = edge_count;

        if (edge_count === 0) continue;

        // Rule 1: LOCKED_KIND_KILL.
        if (node.locked_kind !== undefined) {
            for (let i = 0; i < node.edges.length; i++) {
                const e = node.edges[i];
                if (e.alive && e.kind !== node.locked_kind) {
                    kill_edge(g, e);
                }
            }
            // Re-compact after kills.
            edge_count = 0;
            for (let i = 0; i < node.edges.length; i++) {
                if (node.edges[i].alive) node.edges[edge_count++] = node.edges[i];
            }
            node.edges.length = edge_count;
        }

        if (edge_count === 0) continue;

        // Rule 2: DEAD_PAIR_KILL.
        {
            let killed = false;
            for (let i = 0; i < node.edges.length; i++) {
                const edge = node.edges[i];
                if (!edge.alive) continue;

                const neighbor = edge.a === node ? edge.b : edge.a;
                if (node.cards.length + neighbor.cards.length >= 3) continue;

                // 2-card pair. Can it grow?
                let can_grow = false;

                // Check neighbor's other same-kind edges.
                for (const ne of neighbor.edges) {
                    if (ne.alive && ne !== edge && ne.kind === edge.kind) {
                        can_grow = true;
                        break;
                    }
                }
                // Check our other same-kind edges.
                if (!can_grow) {
                    for (let j = 0; j < node.edges.length; j++) {
                        const oe = node.edges[j];
                        if (oe !== edge && oe.alive && oe.kind === edge.kind) {
                            can_grow = true;
                            break;
                        }
                    }
                }

                if (!can_grow) {
                    kill_edge(g, edge);
                    killed = true;
                }
            }
            if (killed) continue; // node is re-dirtied by kill_edge
        }

        // Rule 3: ONLY_KIND_LOCK.
        if (node.locked_kind === undefined) {
            let first_kind: EdgeKind | undefined;
            let all_same = true;
            for (let i = 0; i < node.edges.length; i++) {
                if (!node.edges[i].alive) continue;
                const k = node.edges[i].kind;
                if (first_kind === undefined) first_kind = k;
                else if (k !== first_kind) { all_same = false; break; }
            }
            if (all_same && first_kind !== undefined) {
                node.locked_kind = first_kind;
                mark_dirty(g, node); // re-enter to apply rule 1
                continue;
            }
        }

        // Rule 4: SET_INFEASIBLE_KILL.
        if (node.cards.length === 1) {
            const val = node.cards[0].value;
            const feasible = g.set_feasible.get(val) ?? 0;
            if (feasible < 3) {
                for (let i = 0; i < node.edges.length; i++) {
                    const e = node.edges[i];
                    if (e.alive && e.kind === EdgeKind.SET) {
                        kill_edge(g, e);
                    }
                }
            }
        }

        // Rule 5: FORCED_MERGE.
        // Re-compact and count.
        edge_count = 0;
        for (let i = 0; i < node.edges.length; i++) {
            if (node.edges[i].alive) node.edges[edge_count++] = node.edges[i];
        }
        node.edges.length = edge_count;

        if (edge_count === 1) {
            const edge = node.edges[0];
            const neighbor = edge.a === node ? edge.b : edge.a;
            const combined = node.cards.length + neighbor.cards.length;

            // If BOTH sides are already valid groups (3+ cards),
            // don't force the merge — it's optional.
            if (node.cards.length >= 3 && neighbor.cards.length >= 3) {
                continue;
            }

            // If THIS node is already valid and the NEIGHBOR has
            // other edges, don't absorb — the neighbor has options.
            if (node.cards.length >= 3) {
                let neighbor_degree = 0;
                for (const ne of neighbor.edges) {
                    if (ne.alive) neighbor_degree++;
                }
                if (neighbor_degree > 1) continue;
                // Neighbor is also degree 1 — it has no other option.
                // Absorb it (e.g., 4th card joining a 3-set).
            }

            if (combined >= 3) {
                // Forced: merge completes or extends a group.
                if (!merge_would_orphan_neighbor(g, edge)) {
                    merge_along(g, edge);
                }
                continue;
            }

            // Combined is 2. The node has no alternative — it either
            // joins here or is orphaned. Check if the pair can grow.
            let can_grow = false;
            for (const ne of neighbor.edges) {
                if (ne.alive && ne !== edge && ne.kind === edge.kind) {
                    can_grow = true;
                    break;
                }
            }

            if (can_grow && !merge_would_orphan_neighbor(g, edge)) {
                // This node is forced into this edge and the merge
                // won't strand any of the neighbor's other connections.
                merge_along(g, edge);
            } else if (!can_grow) {
                // Dead end: pair can't reach 3. Kill.
                kill_edge(g, edge);
            }
            // If can_grow but would orphan: leave the edge alone.
            // Branching will handle it.
        }
    }
}

// --- Score computation ---

function compute_score(cards: Card[], stack_type: CardStackType): number {
    if (cards.length < 3) return 0;
    const type_value =
        stack_type === CardStackType.PURE_RUN ? 100 :
        stack_type === CardStackType.SET ? 60 :
        stack_type === CardStackType.RED_BLACK_RUN ? 50 : 0;
    // Flat per-card scoring (mirrors Score.for_stack).
    return cards.length * type_value;
}

export function graph_score(g: Graph): number {
    let score = 0;
    for (const n of g.nodes) {
        if (!n.alive) continue;
        score += compute_score(n.cards, get_stack_type(n.cards));
    }
    return score;
}

// --- Graph summary ---

export type GraphSummary = {
    alive_nodes: number;
    alive_edges: number;
    total_cards_in_nodes: number;
    nodes_by_size: Map<number, number>;
    resolved_nodes: number;
    unresolved_nodes: number;
    max_degree: number;
    score: number;
    merges: number;
    pruned: number;
};

export function summarize(g: Graph): GraphSummary {
    let alive_nodes = 0;
    let alive_edges = 0;
    let total_cards = 0;
    let resolved = 0;
    let unresolved = 0;
    let max_degree = 0;
    const by_size = new Map<number, number>();
    const counted = new Set<number>();

    for (const n of g.nodes) {
        if (!n.alive) continue;
        alive_nodes++;
        total_cards += n.cards.length;
        by_size.set(n.cards.length, (by_size.get(n.cards.length) ?? 0) + 1);

        let degree = 0;
        for (const e of n.edges) {
            if (e.alive) {
                degree++;
                if (!counted.has(e.id)) { counted.add(e.id); alive_edges++; }
            }
        }
        if (degree === 0) resolved++; else unresolved++;
        if (degree > max_degree) max_degree = degree;
    }

    return {
        alive_nodes, alive_edges, total_cards_in_nodes: total_cards,
        nodes_by_size: by_size, resolved_nodes: resolved,
        unresolved_nodes: unresolved, max_degree,
        score: graph_score(g),
        merges: g.stats.merges, pruned: g.stats.pruned,
    };
}

// --- Clone for branching ---

export function clone_graph(g: Graph): Graph {
    const node_map = new Map<number, GNode>();
    const new_nodes: GNode[] = [];

    for (const n of g.nodes) {
        // Skip dead nodes and orphans (0 edges, <3 cards).
        if (!n.alive) continue;
        if (n.edges.length === 0 && n.cards.length < 3) continue;

        const cloned: GNode = {
            id: n.id, cards: [...n.cards], edges: [],
            alive: true, locked_kind: n.locked_kind,
        };
        node_map.set(n.id, cloned);
        new_nodes.push(cloned);
    }

    for (const n of g.nodes) {
        if (!node_map.has(n.id)) continue;
        for (const e of n.edges) {
            if (!e.alive) continue;
            if (e.a !== n) continue;
            if (!node_map.has(e.b.id)) continue;
            const ce: Edge = {
                id: e.id, a: node_map.get(e.a.id)!, b: node_map.get(e.b.id)!,
                kind: e.kind, alive: true,
            };
            ce.a.edges.push(ce);
            ce.b.edges.push(ce);
        }
    }

    const dirty: GNode[] = [];
    const dirty_set = new Set<number>();
    for (const id of g.dirty_set) {
        const cn = node_map.get(id);
        if (cn && cn.alive) { dirty.push(cn); dirty_set.add(cn.id); }
    }

    return {
        nodes: new_nodes, next_node_id: g.next_node_id,
        next_edge_id: g.next_edge_id, dirty, dirty_set,
        set_feasible: new Map(g.set_feasible),
        stats: { ...g.stats },
    };
}

// --- Branch-and-bound solver ---
//
// The strategy controls two things:
// 1. Which node to branch on (pivot selection).
// 2. What order to try edges (affects pruning — better first = faster).

export type BranchStrategy = {
    name: string;
    // Score an edge for ordering. Higher = try first.
    score_edge: (edge: Edge) => number;
    // Score a node for pivot selection. Higher = pick first.
    score_pivot: (node: GNode) => number;
};

// Built-in strategies.
export const STRATEGY_MIN_DEGREE: BranchStrategy = {
    name: "min_degree",
    score_edge: () => 0,  // no preference
    score_pivot: (n) => {
        let deg = 0;
        for (const e of n.edges) { if (e.alive) deg++; }
        return -deg; // most constrained first
    },
};

export const STRATEGY_PREFER_RUNS: BranchStrategy = {
    name: "prefer_runs",
    score_edge: (e) => {
        // Pure runs score highest per card, try them first.
        const kind_score = e.kind === EdgeKind.PURE_RUN ? 200 :
                           e.kind === EdgeKind.RED_BLACK ? 100 : 50;
        // Bonus for immediate kills (other-kind edges that die).
        let imm = 0;
        for (const ae of e.a.edges) {
            if (ae.alive && ae !== e && ae.kind !== e.kind) imm++;
        }
        for (const be of e.b.edges) {
            if (be.alive && be !== e && be.kind !== e.kind) imm++;
        }
        return kind_score + imm;
    },
    score_pivot: (n) => {
        let deg = 0;
        for (const e of n.edges) { if (e.alive) deg++; }
        return -deg;
    },
};

export const STRATEGY_PREFER_SETS: BranchStrategy = {
    name: "prefer_sets",
    score_edge: (e) => {
        const kind_score = e.kind === EdgeKind.SET ? 200 :
                           e.kind === EdgeKind.PURE_RUN ? 100 : 50;
        let imm = 0;
        for (const ae of e.a.edges) {
            if (ae.alive && ae !== e && ae.kind !== e.kind) imm++;
        }
        for (const be of e.b.edges) {
            if (be.alive && be !== e && be.kind !== e.kind) imm++;
        }
        return kind_score + imm;
    },
    score_pivot: (n) => {
        let deg = 0;
        for (const e of n.edges) { if (e.alive) deg++; }
        return -deg;
    },
};

export const STRATEGY_MAX_CASCADE: BranchStrategy = {
    name: "max_cascade",
    score_edge: (e) => {
        // Maximize immediate kills + new leaves.
        let imm = 0;
        for (const ae of e.a.edges) {
            if (ae.alive && ae !== e && ae.kind !== e.kind) imm++;
        }
        for (const be of e.b.edges) {
            if (be.alive && be !== e && be.kind !== e.kind) imm++;
        }
        return imm;
    },
    score_pivot: (n) => {
        // Pick node with most edges — hub node triggers biggest cascade.
        let deg = 0;
        for (const e of n.edges) { if (e.alive) deg++; }
        return deg;
    },
};

export let MAX_NODES = 500;
export let DISABLE_PRUNING = false;

// Quality metric: more grouped cards first, then higher score.
// Encoded as a single number: grouped_cards * 10000 + score.
// A card is "grouped" only when it's in a valid 3+ node.
// This ensures placing one more card always beats a score increase.
function graph_quality(g: Graph): number {
    let grouped = 0;
    for (const n of g.nodes) {
        if (!n.alive) continue;
        if (n.cards.length >= 3) grouped += n.cards.length;
    }
    return grouped * 10000 + graph_score(g);
}

function solve_recursive(
    g: Graph,
    strategy: BranchStrategy,
    best_quality: { value: number },
    best_graph: { value: Graph | undefined },
    nodes_explored: { value: number },
): void {
    nodes_explored.value++;
    if (nodes_explored.value > MAX_NODES) return;

    propagate(g);

    const quality = graph_quality(g);
    if (quality > best_quality.value) {
        best_quality.value = quality;
        best_graph.value = clone_graph(g);
    }

    // Upper bound: assume all unresolved cards get grouped in pure runs.
    let upper = quality;
    for (const n of g.nodes) {
        if (!n.alive || n.cards.length >= 3) continue;
        let has_edge = false;
        for (const e of n.edges) { if (e.alive) { has_edge = true; break; } }
        // Each unresolved card could be grouped (+10000) and score as
        // part of a pure run (+100).
        if (has_edge) upper += n.cards.length * 10100;
    }
    if (!DISABLE_PRUNING && upper <= best_quality.value) return;

    // Pick pivot using strategy.
    let pivot: GNode | undefined;
    let best_pivot_score = -Infinity;
    for (const n of g.nodes) {
        if (!n.alive) continue;
        let has_edge = false;
        for (const e of n.edges) { if (e.alive) { has_edge = true; break; } }
        if (!has_edge) continue;
        const ps = strategy.score_pivot(n);
        if (ps > best_pivot_score) { best_pivot_score = ps; pivot = n; }
    }
    if (!pivot) return;

    // Collect and sort edges using strategy.
    const to_try: Edge[] = [];
    for (const e of pivot.edges) { if (e.alive) to_try.push(e); }
    to_try.sort((a, b) => strategy.score_edge(b) - strategy.score_edge(a));

    // Try each edge.
    for (const edge of to_try) {
        const branched = clone_graph(g);
        const be = branched.nodes.find((n) => n.id === edge.a.id)!
            .edges.find((e) => e.id === edge.id);
        if (!be || !be.alive) continue;
        merge_along(branched, be);
        solve_recursive(branched, strategy, best_quality, best_graph, nodes_explored);
    }

    // Try skipping this node.
    {
        const branched = clone_graph(g);
        const bp = branched.nodes.find((n) => n.id === pivot.id)!;
        for (const e of [...bp.edges]) { if (e.alive) kill_edge(branched, e); }
        solve_recursive(branched, strategy, best_quality, best_graph, nodes_explored);
    }
}

// --- Public API ---

export type SolveResult = {
    groups: { cards: Card[]; type: CardStackType; score: number }[];
    ungrouped: Card[];
    total_score: number;
    stats: { merges: number; pruned: number };
};

const ALL_STRATEGIES: BranchStrategy[] = [
    STRATEGY_PREFER_RUNS,
    STRATEGY_PREFER_SETS,
    STRATEGY_MIN_DEGREE,
    STRATEGY_MAX_CASCADE,
];

function extract_result(cards: Card[], result_g: Graph, stats: { merges: number; pruned: number }): SolveResult {
    const groups: { cards: Card[]; type: CardStackType; score: number }[] = [];
    const grouped = new Set<Card>();

    for (const n of result_g.nodes) {
        if (!n.alive) continue;
        const type = get_stack_type(n.cards);
        const score = compute_score(n.cards, type);
        if (score > 0) {
            groups.push({ cards: n.cards, type, score });
            for (const c of n.cards) grouped.add(c);
        }
    }

    const ungrouped = cards.filter((c) => !grouped.has(c));
    return { groups, ungrouped, total_score: graph_score(result_g), stats };
}

export function solve(cards: Card[], strategy: BranchStrategy = STRATEGY_MIN_DEGREE): SolveResult {
    // Try all strategies, keep the result with most grouped cards
    // (breaking ties by score).
    const strategies = strategy === STRATEGY_MIN_DEGREE
        ? ALL_STRATEGIES
        : [strategy, ...ALL_STRATEGIES.filter((s) => s !== strategy)];

    let best_result: SolveResult | undefined;
    let best_q = -1;

    for (const strat of strategies) {
        const g = create_graph(cards);
        const best_quality = { value: 0 };
        const best_graph: { value: Graph | undefined } = { value: undefined };
        const nodes_explored = { value: 0 };

        solve_recursive(g, strat, best_quality, best_graph, nodes_explored);

        const result_g = best_graph.value ?? g;
        const result = extract_result(cards, result_g, g.stats);
        const q = (cards.length - result.ungrouped.length) * 10000 + result.total_score;

        if (q > best_q) {
            best_q = q;
            best_result = result;
        }

        // Perfect solution — no point trying other strategies.
        if (result.ungrouped.length === 0) break;
    }

    return best_result!;
}

export function format_solve_result(result: SolveResult): string {
    const lines: string[] = [];
    for (const g of result.groups) {
        lines.push(`  [${g.cards.map(card_label).join(" ")}] (${g.type}) = ${g.score}`);
    }
    if (result.ungrouped.length > 0) {
        lines.push(`  Ungrouped: ${result.ungrouped.map(card_label).join(" ")}`);
    }
    lines.push(`  Score: ${result.total_score}`);
    lines.push(`  Merges: ${result.stats.merges}  Pruned: ${result.stats.pruned}`);
    return lines.join("\n");
}
