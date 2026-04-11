// Tests that sound files exist and paths are consistent.
//
// Sound effects are in public/ and served by Vite at the base URL.
// This test catches the bug where directory restructuring breaks
// relative paths.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const SOUND_FILES = ["ding.mp3", "purr.mp3", "bark.mp3"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

// Test 1: All sound files exist in public/.
function test_sound_files_exist() {
    for (const file of SOUND_FILES) {
        const full_path = path.join(PUBLIC_DIR, file);
        assert.ok(
            fs.existsSync(full_path),
            `Sound file missing: ${full_path}`,
        );
    }
}

// Test 2: game.ts references all expected sound files.
function test_game_references_all_sounds() {
    const game_path = path.resolve(__dirname, "game.ts");
    const game_src = fs.readFileSync(game_path, "utf-8");

    for (const file of SOUND_FILES) {
        assert.ok(
            game_src.includes(file),
            `game.ts does not reference ${file}`,
        );
    }
}

// Test 3: game.ts uses BASE_URL for sound paths (not bare relative).
function test_uses_base_url() {
    const game_path = path.resolve(__dirname, "game.ts");
    const game_src = fs.readFileSync(game_path, "utf-8");

    // Should use import.meta.env.BASE_URL, not bare "ding.mp3".
    assert.ok(
        game_src.includes("BASE_URL"),
        "game.ts should use import.meta.env.BASE_URL for sound paths",
    );

    // Should NOT have bare relative paths like: .src = "ding.mp3"
    const bare_pattern = /\.src\s*=\s*"(ding|purr|bark)\.mp3"/;
    assert.ok(
        !bare_pattern.test(game_src),
        "game.ts should not use bare relative paths for sound files",
    );
}

// --- Run all ---

test_sound_files_exist();
test_game_references_all_sounds();
test_uses_base_url();

console.log("sound: all tests passed");
