// Serialize a Play into a PlayRecord suitable for POST
// /gopher/games/{id}/plays. The PlayRecord carries both the
// strategic metadata (trick id, description, highlights) and the
// mechanical diff (board_event) in one payload.
//
// The `board_event` field is intentionally opaque here — the caller
// computes it from the pre/post board diff and passes it in.

import type { JsonCard } from "../core/card";
import type { JsonBoardCard, JsonCardStack } from "../core/card_stack";
import type { Play } from "./trick";

// Shape expected by Gopher's POST /gopher/games/{id}/plays.
export type PlayRecord = {
    trick_id: string;
    description: string;
    hand_cards: JsonCard[];
    board_cards: JsonCard[];
    detail: unknown;
    player: number;
    note?: string;
    board_event: BoardEventPayload;
};

// Same shape Cat already uses for POST /gopher/games/{id}/events —
// the mechanical diff that both the legacy replay viewer and the
// referee understand.
export type BoardEventPayload = {
    stacks_to_remove: JsonCardStack[];
    stacks_to_add: JsonCardStack[];
    hand_cards_to_release?: JsonBoardCard[];
};

// Turn a Play + computed board diff into a PlayRecord. The caller
// is responsible for building board_event from the pre/post board
// snapshots since that's usage-specific (console_player vs UI).
export function serialize_play(
    play: Play,
    player: number,
    description: string,
    board_event: BoardEventPayload,
    board_cards_used: JsonCard[] = [],
): PlayRecord {
    return {
        trick_id: play.trick.id,
        description,
        hand_cards: play.hand_cards.map(hc => hc.card.toJSON()),
        board_cards: board_cards_used,
        detail: null,
        player,
        board_event,
    };
}
