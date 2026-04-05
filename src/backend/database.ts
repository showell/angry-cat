import type { Message, Stream, User } from "./db_types";
import type { ZulipEvent } from "./event";
import { EventFlavor } from "./event";
import * as fetch from "./fetch";
import type { MessageIndex } from "./message_index";
import type { ReactionsMap } from "./reactions";
import type { TopicMap } from "./topic_map";

export let DB: Database;

export type MessageMap = Map<number, Message>;
export type UserMap = Map<number, User>;

export type Database = {
    current_user_id: number;
    user_map: Map<number, User>;
    channel_map: Map<number, Stream>;
    topic_map: TopicMap;
    message_map: MessageMap;
    message_index: MessageIndex;
    reactions_map: ReactionsMap;
};

export async function fetch_original_data(): Promise<void> {
    DB = await fetch.fetch_model_data();
}

// EVENTS

export function handle_event(event: ZulipEvent): void {
    if (event.flavor === EventFlavor.MESSAGE) {
        add_message_to_cache(event.message);
    }

    if (event.flavor === EventFlavor.MUTATE_MESSAGE_ADDRESS) {
        mutate_messages(event.message_ids, (message) => {
            message.stream_id = event.new_channel_id;
            message.topic_id = event.new_topic_id;
            DB.message_index.add_message(message);
        });
    }

    if (event.flavor === EventFlavor.MUTATE_MESSAGE_CONTENT) {
        mutate_message(event.message_id, (message) => {
            message.content = event.content;
        });
    }

    if (event.flavor === EventFlavor.MUTATE_UNREAD) {
        mutate_messages(event.message_ids, (message) => {
            message.unread = event.unread;
        });
    }

    if (event.flavor === EventFlavor.MUTATE_STREAM) {
        const stream = DB.channel_map.get(event.stream_id);
        if (stream) {
            if (event.description !== undefined) {
                stream.description = event.description;
            }
            stream.rendered_description = event.rendered_description;
        }
    }

    if (event.flavor === EventFlavor.REACTION_ADD_EVENT) {
        DB.reactions_map.process_add_event(event);
    }

    if (event.flavor === EventFlavor.REACTION_REMOVE_EVENT) {
        DB.reactions_map.process_remove_event(event);
    }
}

function add_message_to_cache(message: Message) {
    DB.message_index.add_message(message);
    DB.message_map.set(message.id, message);
}

function mutate_message(
    message_id: number,
    mutate: (message: Message) => void,
): void {
    const message = DB.message_map.get(message_id);
    if (message) {
        mutate(message);
    } else {
        console.log("UNKNOWN message id!", message_id);
    }
}

function mutate_messages(
    message_ids: number[],
    mutate: (message: Message) => void,
): void {
    for (const message_id of message_ids) {
        mutate_message(message_id, mutate);
    }
}
