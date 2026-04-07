// Tests for parse_content — the bridge between message HTML and the
// detection Sets (code, images, mentions). This is the one test that
// exercises the DOMParser mock.

import assert from "node:assert/strict";
import * as parse from "../backend/parse";
import { fresh_db, make_message, add_to_db } from "./test_helpers";

// Detects code blocks via div.codehilite
{
    const db = fresh_db();
    const msg = make_message({ id: 1, content: `<div class="codehilite"><pre><code>x = 1</code></pre></div>` });
    parse.parse_content(msg, db);
    assert(db.code_message_ids.has(1));
}

// Detects images via <img> tags
{
    const db = fresh_db();
    const msg = make_message({ id: 1, content: `<p><img src="cat.png"></p>` });
    parse.parse_content(msg, db);
    assert(db.image_message_ids.has(1));
}

// Detects mentions matching current_user_id
{
    const db = fresh_db();
    const msg = make_message({ id: 1, content: `<span class="user-mention" data-user-id="1">@Steve</span>` });
    parse.parse_content(msg, db);
    assert(db.mention_message_ids.has(1));
}

// Does not detect mentions for other users
{
    const db = fresh_db();
    const msg = make_message({ id: 1, content: `<span class="user-mention" data-user-id="2">@Claude</span>` });
    parse.parse_content(msg, db);
    assert(!db.mention_message_ids.has(1));
}

// Plain text — no detections
{
    const db = fresh_db();
    const msg = make_message({ id: 1, content: `<p>hello world</p>` });
    parse.parse_content(msg, db);
    assert(!db.code_message_ids.has(1));
    assert(!db.image_message_ids.has(1));
    assert(!db.mention_message_ids.has(1));
}

console.log("  parse_test: OK");
