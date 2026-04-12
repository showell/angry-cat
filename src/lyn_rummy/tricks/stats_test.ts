// Unit test for TurnStatsRecorder — it accumulates per-turn trick
// counts and emits JSONL records compatible with analyze_stats.ts.

import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Play, Trick } from "./trick";
import { TurnStatsRecorder } from "./stats";

// Minimal fake trick + play — the recorder only touches trick.id
// and the cards_this_play integer passed to record_play.
function make_fake_play(trick_id: string): Play {
    const trick: Trick = {
        id: trick_id,
        description: `fake ${trick_id}`,
        find_plays: () => [],
    };
    return {
        trick,
        hand_cards: [],
        apply: () => [],
    };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stats-"));
const stats_path = path.join(tmp, "stats.jsonl");

// --- Case 1: a single turn with three trick firings ---
{
    const r = new TurnStatsRecorder(stats_path);
    r.record_play(make_fake_play("direct_play"), 1);
    r.record_play(make_fake_play("direct_play"), 1);
    r.record_play(make_fake_play("pair_peel"),   2);
    const rec = r.end_turn(7, 1, false);
    assert.equal(rec.game_id, 7);
    assert.equal(rec.player, 1);
    assert.equal(rec.cards_played, 4);
    assert.equal(rec.got_stuck, false);
    assert.deepEqual(rec.tricks, { direct_play: 2, pair_peel: 1 });
}

// --- Case 2: a stuck turn produces a zero-cards record ---
{
    const r = new TurnStatsRecorder(stats_path);
    const rec = r.end_turn(7, 0, true);
    assert.equal(rec.cards_played, 0);
    assert.equal(rec.got_stuck, true);
    assert.deepEqual(rec.tricks, {});
}

// --- Case 3: recorder resets between turns ---
{
    const r = new TurnStatsRecorder(stats_path);
    r.record_play(make_fake_play("swap"), 1);
    const first = r.end_turn(7, 0, false);
    assert.deepEqual(first.tricks, { swap: 1 });

    r.record_play(make_fake_play("direct_play"), 1);
    const second = r.end_turn(7, 0, false);
    assert.deepEqual(second.tricks, { direct_play: 1 });
    assert.equal(second.cards_played, 1);
}

// --- Case 4: JSONL file on disk has the expected records ---
{
    const lines = fs.readFileSync(stats_path, "utf-8").split("\n").filter(l => l.trim());
    // 4 end_turn() calls total across cases 1–3.
    assert.equal(lines.length, 4);
    const parsed = lines.map(l => JSON.parse(l));
    assert.deepEqual(parsed[0].tricks, { direct_play: 2, pair_peel: 1 });
    assert.equal(parsed[1].got_stuck, true);
    assert.deepEqual(parsed[2].tricks, { swap: 1 });
    assert.deepEqual(parsed[3].tricks, { direct_play: 1 });
}

// Cleanup.
fs.rmSync(tmp, { recursive: true, force: true });
console.log("All TurnStatsRecorder tests passed.");
