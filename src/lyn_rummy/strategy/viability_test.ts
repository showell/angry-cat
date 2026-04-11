import assert from "node:assert/strict";
import { Card, OriginDeck } from "../core/card";
import { can_merge, stack_viability } from "./viability";

const D1 = OriginDeck.DECK_ONE;
const D2 = OriginDeck.DECK_TWO;

function cards(...labels: string[]): Card[] {
    return labels.map((label) => Card.from(label, D1));
}
function card(label: string, deck = D1): Card {
    return Card.from(label, deck);
}

// can_merge: cannot merge into stacks of size < 2
{
    assert.equal(can_merge(card("AH"), []), false);
    assert.equal(can_merge(card("AH"), cards("2H")), false);
}

// can_merge: pairs that grow into a 3-stack
{
    // pure run growth
    assert.equal(can_merge(card("5H"), cards("3H", "4H")), true);
    assert.equal(can_merge(card("2H"), cards("3H", "4H")), true);
    // set growth
    assert.equal(can_merge(card("7S"), cards("7C", "7D")), true);
    // rb run growth
    assert.equal(can_merge(card("5H"), cards("3H", "4S")), true);
    assert.equal(can_merge(card("2S"), cards("3H", "4S")), true);
    // K -> A wrap
    assert.equal(can_merge(card("AH"), cards("QH", "KH")), true);
    // A -> K wrap (prepend)
    assert.equal(can_merge(card("KH"), cards("AH", "2H")), true);
}

// can_merge: extending an existing 3+ stack
{
    assert.equal(can_merge(card("6H"), cards("3H", "4H", "5H")), true);
    assert.equal(can_merge(card("2H"), cards("3H", "4H", "5H")), true);
    assert.equal(can_merge(card("7S"), cards("7C", "7D", "7H")), true);
}

// can_merge: rejections
{
    // wrong suit for a pure run
    assert.equal(can_merge(card("5D"), cards("3H", "4H")), false);
    // gap in run
    assert.equal(can_merge(card("7H"), cards("3H", "4H", "5H")), false);
    // wrong value for a set
    assert.equal(can_merge(card("8C"), cards("7C", "7D")), false);
}

// stack_viability: merge cases return exactly 100
{
    assert.equal(stack_viability(card("5H"), cards("3H", "4H")), 100);
    assert.equal(stack_viability(card("7S"), cards("7C", "7D", "7H")), 100);
    assert.equal(stack_viability(card("6H"), cards("3H", "4H", "5H")), 100);
    assert.equal(stack_viability(card("AH"), cards("QH", "KH")), 100);
}

// stack_viability: dup penalty (-30)
{
    // Target is 7C from deck 1, stack contains 7C from deck 2
    // (twin). Stack is also a 3-set centered on the target's
    // value, so the set distance penalty is 0³ = 0. Net: -30.
    const target = card("7C", D1);
    const stack = [
        card("7C", D2),
        card("7D", D1),
        card("7H", D1),
    ];
    assert.equal(stack_viability(target, stack), 70);
}

// stack_viability: set penalty (distance cubed)
{
    // 3-set of 7s, target is 8 of some other suit.
    // Distance(8, 7) = 1, cubed = 1. 100 - 1 = 99.
    const stack = cards("7C", "7D", "7H");
    assert.equal(stack_viability(card("8S"), stack), 99);
    // Distance(10, 7) = 3, cubed = 27. 100 - 27 = 73.
    assert.equal(stack_viability(card("TS"), stack), 73);
    // Distance(K, 7) = 6, cubed = 216. 100 - 216 = -116.
    // (Penalties can drive viability negative — that's fine.)
    assert.equal(stack_viability(card("KS"), stack), -116);
}

// stack_viability: pure run penalty, target shares the suit
{
    // 3-pure-run [3C 4C 5C], target 9C (same suit).
    // Every card is a viable partner (same-suit wins).
    // Nearest distance: |9-5|=4, |9-4|=5, |9-3|=6, min=4. Squared=16.
    const stack = cards("3C", "4C", "5C");
    assert.equal(stack_viability(card("9C"), stack), 84);
    // Same stack, target KC. Distance(K,3)=3 (wrap-around).
    // Squared=9.
    assert.equal(stack_viability(card("KC"), stack), 91);
}

// stack_viability: pure run penalty, target is cross-suit
{
    // 3-pure-run [3C 4C 5C] (all black), target 9D (red).
    // Per-card viability for 9D:
    //   3C: dist 6 even, opposite color → not viable
    //   4C: dist 5 odd, opposite color → viable (rb odd partner)
    //   5C: dist 4 even, opposite color → not viable
    // Nearest viable: 4C at dist 5. Squared = 25. Final 75.
    const stack = cards("3C", "4C", "5C");
    assert.equal(stack_viability(card("9D"), stack), 75);
}

// stack_viability: rb run penalty
{
    // 3-rb-run [4S 5H 6S], target 3H (red).
    //   4S: dist 1 odd, opposite color → viable
    //   5H: dist 2, same suit → viable (and dist 2 even same color → also rb-viable)
    //   6S: dist 3 odd, opposite color → viable
    // Nearest = 1 (4S). Squared = 1. Final 99.
    // (Note: 3H actually CAN merge as a prepend → returns 100 from
    // the merge shortcut, not the penalty path. So we use a target
    // that does NOT merge but still has viable partners.)
    //
    // Use target 8H instead. 8H is not adjacent to either end of
    // [4S 5H 6S] so it can't merge.
    //   4S: dist |8-4|=4 even, opposite color → not viable
    //   5H: dist 3, same suit → viable
    //   6S: dist 2 even, opposite color → not viable
    // Nearest viable: 5H at dist 3. Squared = 9. Final 91.
    const stack = cards("4S", "5H", "6S");
    assert.equal(stack_viability(card("8H"), stack), 91);
}

// stack_viability: run with no strictly-viable partners
{
    // RB run [5C 6D 7C], target 3H.
    // Strict viability: nothing matches. Soft rule: every card
    // counts at distance + 1.
    //   5C: dist 2, +1 -> eff 3
    //   6D: dist 3, +1 -> eff 4
    //   7C: dist 4, +1 -> eff 5
    // Nearest eff = 3 (5C). Squared = 9. Final 91.
    const stack = cards("5C", "6D", "7C");
    assert.equal(stack_viability(card("3H"), stack), 91);
}

// stack_viability: a wrong-parity but very close card beats a
// far-but-viable card.
{
    // RB run [KD AC 2H 3S], target 10H (red).
    //   KD: dist 3 (red same color, odd same → not viable). eff 4.
    //   AC: dist 4 (black opposite, even opposite → not viable). eff 5.
    //   2H: dist 5 (same suit → viable).                       eff 5.
    //   3S: dist 6 (black opposite, even opposite → not viable). eff 7.
    // Nearest eff = 4 (KD via the soft rule). Squared = 16. Final 84.
    // Under the old strict rule this stack scored 75 (driven only
    // by 2H at dist 5).
    const stack = cards("KD", "AC", "2H", "3S");
    assert.equal(stack_viability(card("TH"), stack), 84);
}

// stack_viability: run partner viability — distance 0 not viable
{
    // RB run [2S 3D 4S], target 3H.
    //   2S: dist 1 odd, opposite color → viable
    //   3D: dist 0 → not viable (same value, can't share a run)
    //   4S: dist 1 odd, opposite color → viable
    // Nearest viable = 1. Squared = 1. Final 99.
    const stack = cards("2S", "3D", "4S");
    assert.equal(stack_viability(card("3H"), stack), 99);
}

// stack_viability: combined dup + type penalty
{
    // 3-pure-run [3C 4C 5C], target 5C from deck 2 (twin in stack).
    // Merge check: append → [3C 4C 5C 5C] dup (bogus); prepend
    // → [5C 3C 4C 5C] bogus. No merge.
    // Dup penalty: -30.
    // Run partners (excluding the dup itself, which is dist 0):
    //   4C: dist 1, same suit → viable
    //   3C: dist 2, same suit → viable
    // Nearest viable = 1 (4C). Squared = 1.
    // Total: 100 - 30 - 1 = 69.
    const stack = cards("3C", "4C", "5C");
    assert.equal(stack_viability(card("5C", D2), stack), 69);
}

console.log("All viability tests passed.");
