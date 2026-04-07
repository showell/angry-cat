// Shared test utilities. Import this instead of duplicating make_db
// and make_message across test files.

import type { Database } from "../backend/database";
import * as database from "../backend/database";
import type { Message } from "../backend/db_types";
import { MessageIndex } from "../backend/message_index";
import { ReactionsMap } from "../backend/reactions";
import { TopicMap } from "../backend/topic_map";

export function make_db(): Database {
    return {
        current_user_id: 1,
        user_map: new Map([
            [1, { id: 1, email: "steve@test.com", full_name: "Steve", is_admin: true }],
            [2, { id: 2, email: "claude@test.com", full_name: "Claude", is_admin: false }],
        ]),
        channel_map: new Map([
            [10, { stream_id: 10, name: "General", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
            [20, { stream_id: 20, name: "Random", description: "", rendered_description: "", stream_weekly_traffic: 0 }],
        ]),
        topic_map: new TopicMap(),
        message_map: new Map(),
        message_index: new MessageIndex(),
        reactions_map: new ReactionsMap(),
        unread_ids: new Set(),
        image_message_ids: new Set(),
        code_message_ids: new Set(),
        mention_message_ids: new Set(),
        starred_ids: new Set(),
    };
}

// Build a message with sensible defaults. Override any field by
// passing it in the opts object.
export function make_message(opts: Partial<Message> & { id: number }): Message {
    return {
        content: "<p>test</p>",
        sender_id: 1,
        stream_id: 10,
        timestamp: 1000 + opts.id,
        topic_id: 1,
        local_message_id: undefined,
        type: "stream",
        ...opts,
    };
}

// Create a fresh DB, install it, and return it.
export function fresh_db(): Database {
    const db = make_db();
    database.set_db_for_testing(db);
    return db;
}

// Add a message to the DB (message_map + message_index).
export function add_to_db(db: Database, msg: Message): void {
    db.message_map.set(msg.id, msg);
    db.message_index.add_message(msg);
}
