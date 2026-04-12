// The plugin interface for a LynRummy "trick" — a pattern a human
// has in their bag and can apply to a given (hand, board) state.
//
// Each trick lives in its own module and exports a single Trick.
// A trick is stateless: it examines the state, returns a list of
// concrete Plays, and does nothing else.

import type { HandCard, CardStack } from "../core/card_stack";

// A concrete proposed move that a trick has recognized.
export type Play = {
    // The trick that generated this play. Used for logging, annotation,
    // stats bucketing, and replay viewers.
    trick: Trick;

    // Hand cards this play will place on the board if executed. Used
    // for UI highlighting, hand removal after apply(), and coverage
    // tests.
    hand_cards: HandCard[];

    // Execute the play, mutating `board` in place. Returns the hand
    // cards actually played (usually equal to `hand_cards`). Returns
    // [] if execution fails — which is a drift bug between detection
    // and execution.
    apply(board: CardStack[]): HandCard[];
};

// A trick: the plugin itself. Stateless, locally complete — never
// assumes other tricks have run first or will run after.
export interface Trick {
    // Stable machine id (e.g. "direct_play", "swap", "pair_peel").
    readonly id: string;

    // Default human-readable description. A Play may override with
    // a more specific wording, but this is the trick's general form.
    readonly description: string;

    // Enumerate every applicable Play. Empty list means the trick
    // doesn't apply to this state.
    find_plays(hand: HandCard[], board: CardStack[]): Play[];
}
