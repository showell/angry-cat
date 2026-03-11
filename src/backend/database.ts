import type { ZulipEvent } from "./event";
import type { User, Stream, Message } from "./db_types";

import { EventFlavor } from "./event";
import * as fetch from "./fetch";
import { TopicMap } from "./topic_map";

export let DB: Database;

export type Database = {
    current_user_id: number;
    user_map: Map<number, User>;
    channel_map: Map<number, Stream>;
    topic_map: TopicMap;
    message_map: Map<number, Message>;
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

    if (event.flavor === EventFlavor.REACTION_ADD_EVENT) {
        mutate_message(event.message_id, (message) => {
            const reaction = message.reactions.find(
                (reaction) => reaction.emoji_code === event.emoji_code,
            );
            if (reaction) {
                reaction.user_ids.add(event.user_id);
            } else {
                message.reactions.push({
                    message_id: event.message_id,
                    emoji_code: event.emoji_code,
                    emoji_name: event.emoji_name,
                    user_ids: new Set<number>([event.user_id]),
                });
            }
        });
    }

    if (event.flavor === EventFlavor.REACTION_REMOVE_EVENT) {
        mutate_message(event.message_id, (message) => {
            const reaction_idx = message.reactions.findIndex(
                (reaction) => reaction.emoji_code === event.emoji_code,
            );
            const reaction = message.reactions[reaction_idx];
            reaction?.user_ids.delete(event.user_id);
            if (reaction?.user_ids.size === 0) {
                message.reactions.splice(reaction_idx, 1);
            }
        });
    }
}

function add_message_to_cache(message: Message) {
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
