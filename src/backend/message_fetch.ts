import type { Database } from "./database";
import type { Message } from "./db_types";
import type { ServerMessage } from "./zulip_client";

import * as parse from "./parse";
import * as zulip_client from "./zulip_client";

const INITIAL_BATCH_SIZE = 2000;

type State = {
    found_oldest: boolean;
    oldest_id: number;
};

let STATE: State;

export async function fetch_initial_messages(db: Database): Promise<void> {
    const data = await zulip_client.get_messages("newest", INITIAL_BATCH_SIZE);

    STATE = {
        found_oldest: data.found_oldest,
        oldest_id: data.messages[0].id,
    };

    await process_message_rows_from_server(db, data.messages);

    console.log(`${db.message_map.size} messages fetched!`);
    console.log(STATE);
}

async function process_message_rows_from_server(
    db: Database,
    rows: ServerMessage[],
): Promise<void> {
    const messages: Message[] = rows
        .filter((row) => row.type === "stream")
        .map((row) => {
            const local_message_id = undefined; // is only in events

            const topic = db.topic_map.get_or_make_topic_for(
                row.stream_id,
                row.subject,
            );
            const unread =
                row.flags.find((flag: string) => flag === "read") === undefined;

            const message_id = row.id;

            const message: Message = {
                code_snippets: [],
                content: row.content,
                github_refs: [],
                id: message_id,
                is_super_new: false,
                local_message_id,
                sender_id: row.sender_id,
                stream_id: row.stream_id,
                timestamp: row.timestamp,
                topic_id: topic.topic_id,
                type: row.type,
                unread,
            };

            parse.parse_content(message);
            db.reactions_map.add_server_reactions(row.reactions, message_id);

            return message;
        });

    for (const row of rows) {
        if (!db.user_map.has(row.sender_id)) {
            const id = row.sender_id;
            const email = row.sender_email;
            const full_name = row.sender_full_name;
            const user = { id, email, full_name };
            db.user_map.set(id, user);
        }
    }

    for (const message of messages) {
        db.message_index.add_message(message);
        db.message_map.set(message.id, message);
    }
}
