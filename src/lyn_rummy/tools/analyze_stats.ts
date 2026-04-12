// Analyze turn stats to see what patterns are working.

import * as fs from "fs";

const path = "src/lyn_rummy/stats.jsonl";
if (!fs.existsSync(path)) {
    console.log("No stats file yet. Play some games first.");
    process.exit(0);
}

const lines = fs.readFileSync(path, "utf-8").split("\n").filter(l => l.trim());
const turns = lines.map(l => JSON.parse(l));

console.log(`Total turns: ${turns.length}`);

const total_cards = turns.reduce((n, t) => n + t.cards_played, 0);
const stuck_count = turns.filter(t => t.got_stuck).length;
const total_fumbles = turns.reduce((n, t) => n + t.fumbles, 0);

console.log(`Total cards played: ${total_cards} (${(total_cards / turns.length).toFixed(1)} per turn)`);
console.log(`Got stuck: ${stuck_count} turns (${(stuck_count * 100 / turns.length).toFixed(0)}%)`);
console.log(`Fumbles: ${total_fumbles}`);

// Hint type distribution.
const hint_counts: Record<string, number> = {};
for (const t of turns) {
    for (const [k, v] of Object.entries(t.hint_types)) {
        hint_counts[k] = (hint_counts[k] || 0) + (v as number);
    }
}
console.log("\nHint usage:");
const sorted = Object.entries(hint_counts).sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted) {
    console.log(`  ${v.toString().padStart(4)} ${k}`);
}

// Idioms.
const idiom_counts: Record<string, number> = {};
for (const t of turns) {
    for (const [k, v] of Object.entries(t.idioms_fired)) {
        idiom_counts[k] = (idiom_counts[k] || 0) + (v as number);
    }
}
if (Object.keys(idiom_counts).length > 0) {
    console.log("\nIdioms fired:");
    for (const [k, v] of Object.entries(idiom_counts)) {
        console.log(`  ${v.toString().padStart(4)} ${k}`);
    }
}

// Cards played distribution.
console.log("\nCards per turn distribution:");
const buckets: Record<string, number> = { "0": 0, "1-3": 0, "4-7": 0, "8-10": 0, "11+": 0 };
for (const t of turns) {
    if (t.cards_played === 0) buckets["0"]++;
    else if (t.cards_played <= 3) buckets["1-3"]++;
    else if (t.cards_played <= 7) buckets["4-7"]++;
    else if (t.cards_played <= 10) buckets["8-10"]++;
    else buckets["11+"]++;
}
for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(5)} ${v.toString().padStart(4)}`);
}
