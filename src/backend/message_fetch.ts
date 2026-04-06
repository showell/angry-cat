import * as dm_model from "../dm/model";
import type { Database } from "./database";
import type { Message } from "./db_types";
import * as parse from "./parse";
import type { ServerMessage, ServerRecipient } from "./zulip_client";
import * as zulip_client from "./zulip_client";

function extract_recipient_ids(display_recipient: string | ServerRecipient[]): number[] {
    if (typeof display_recipient === "string") return [];
    return display_recipient.map((r) => r.id);
}

const INITIAL_BATCH_SIZE = 1000;
const BACKFILL_BATCH_SIZE = 5000;
const MAX_SIZE = 50_000; // not exact always

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

export async function backfill(
    db: Database,
    on_progress?: (count: number) => void,
): Promise<void> {
    while (!STATE.found_oldest) {
        const num_before = Math.min(
            MAX_SIZE - db.message_map.size,
            BACKFILL_BATCH_SIZE,
        );

        if (num_before <= 0) {
            break;
        }

        console.log("attempt to fetch", num_before);

        const data = await zulip_client.get_messages(
            STATE.oldest_id.toString(),
            num_before,
        );

        STATE = {
            found_oldest: data.found_oldest,
            oldest_id: data.messages[0].id,
        };

        await process_message_rows_from_server(db, data.messages);
        on_progress?.(db.message_map.size);

        console.log(`${db.message_map.size} messages in cache! (backfill)`);
        console.log(STATE);

        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

async function process_message_rows_from_server(
    db: Database,
    rows: ServerMessage[],
): Promise<void> {
    const dm_messages: dm_model.DirectMessage[] = [];
    for (const row of rows) {
        if (row.type === "private") {
            const unread =
                row.flags.find((flag: string) => flag === "read") === undefined;
            dm_messages.push({
                id: row.id,
                sender_id: row.sender_id,
                recipient_ids: extract_recipient_ids(row.display_recipient),
                content: row.content,
                timestamp: row.timestamp,
                unread,
            });
        }
    }
    if (dm_messages.length > 0) {
        dm_model.add_messages(dm_messages);
    }

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

            if (unread) {
                db.unread_ids.add(message_id);
            }

            const message: Message = {
                content: row.content,
                id: message_id,
                local_message_id,
                sender_id: row.sender_id,
                stream_id: row.stream_id,
                timestamp: row.timestamp,
                topic_id: topic.topic_id,
                type: row.type,
            };

            parse.parse_content(message, db);
            db.reactions_map.add_server_reactions(row.reactions, message_id);

            return message;
        });

    for (const row of rows) {
        if (!db.user_map.has(row.sender_id)) {
            const id = row.sender_id;
            const email = row.sender_email;
            const full_name = row.sender_full_name;
            const user = { id, email, full_name, is_admin: false };
            db.user_map.set(id, user);
        }
    }

    for (const message of messages) {
        db.message_index.add_message(message);
        db.message_map.set(message.id, message);
    }
}
