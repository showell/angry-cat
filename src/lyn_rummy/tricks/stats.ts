// Per-turn stats for the plugin system.
//
// Layout mirrors the legacy stats.jsonl schema but swaps the
// verbose "hint_types" key (full description strings) for "tricks"
// (trick.id strings). analyze_stats.ts handles both formats.
//
// Writer is usage-oriented: call record_play() after each successful
// Play, and end_turn() at the end of a player's turn to flush.

import * as fs from "fs";
import type { Play } from "./trick";

export type TurnStatsRecord = {
    game_id: number;
    player: number;
    cards_played: number;
    tricks: Record<string, number>;
    got_stuck: boolean;
    timestamp: string;
};

export class TurnStatsRecorder {
    private tricks: Record<string, number> = {};
    private cards_played = 0;

    constructor(private readonly path: string) {}

    record_play(play: Play, cards_this_play: number): void {
        const id = play.trick.id;
        this.tricks[id] = (this.tricks[id] ?? 0) + 1;
        this.cards_played += cards_this_play;
    }

    // Flush the accumulated turn to JSONL and reset.
    end_turn(game_id: number, player: number, got_stuck: boolean): TurnStatsRecord {
        const record: TurnStatsRecord = {
            game_id,
            player,
            cards_played: this.cards_played,
            tricks: this.tricks,
            got_stuck,
            timestamp: new Date().toISOString(),
        };
        fs.appendFileSync(this.path, JSON.stringify(record) + "\n");
        this.tricks = {};
        this.cards_played = 0;
        return record;
    }
}
