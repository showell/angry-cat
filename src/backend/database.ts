import type { Address } from "../address";
import type { Message, Stream, User } from "./db_types";
import type { ZulipEvent } from "./event";
import { EventFlavor } from "./event";
import * as fetch from "./fetch";
import type { MessageIndex } from "./message_index";
import * as parse from "./parse";
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
    unread_ids: Set<number>;
    image_message_ids: Set<number>;
    code_message_ids: Set<number>;
    mention_message_ids: Set<number>;
    starred_ids: Set<number>;
};

export function is_unread(message_id: number): boolean {
    return DB.unread_ids.has(message_id);
}

export function has_images(message_id: number): boolean {
    return DB.image_message_ids.has(message_id);
}

export function has_code(message_id: number): boolean {
    return DB.code_message_ids.has(message_id);
}

export function has_mention(message_id: number): boolean {
    return DB.mention_message_ids.has(message_id);
}

export function is_starred(message_id: number): boolean {
    return DB.starred_ids.has(message_id);
}

export function label_for_address(address: Address): string {
    const { channel_id, topic_id, message_id } = address;
    const channel_name =
        channel_id !== undefined
            ? (DB.channel_map.get(channel_id)?.name ?? `channel:${channel_id}`)
            : "?";
    const topic_name =
        topic_id !== undefined
            ? (DB.topic_map.get(topic_id)?.topic_name ?? `topic:${topic_id}`)
            : "?";
    return message_id !== undefined
        ? `#${channel_name} > ${topic_name} (msg ${message_id})`
        : `#${channel_name} > ${topic_name}`;
}

// Used by tests to inject a database without fetching from a server.
export function set_db_for_testing(db: Database): void {
    DB = db;
}

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
        for (const id of event.message_ids) {
            if (event.unread) {
                DB.unread_ids.add(id);
            } else {
                DB.unread_ids.delete(id);
            }
        }
    }

    if (event.flavor === EventFlavor.MUTATE_STARRED) {
        for (const id of event.message_ids) {
            if (event.starred) {
                DB.starred_ids.add(id);
            } else {
                DB.starred_ids.delete(id);
            }
        }
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

    if (event.flavor === EventFlavor.SUBSCRIPTION_ADD) {
        for (const sub of event.subscriptions) {
            if (!DB.channel_map.has(sub.stream_id)) {
                DB.channel_map.set(sub.stream_id, {
                    stream_id: sub.stream_id,
                    name: sub.name,
                    description: sub.description,
                    rendered_description: sub.rendered_description,
                    stream_weekly_traffic: sub.stream_weekly_traffic,
                });
            }
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
    parse.parse_content(message, DB);
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
