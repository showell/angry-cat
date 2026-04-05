import type { ChannelRow } from "../channel_row";
import type { TopicRow } from "../topic_row";
import * as channel_row_query from "./channel_row_query";
import { DB } from "./database";
import type { Message, Stream, User } from "./db_types";
import type { Filter } from "./filter";
import * as topic_row_query from "./topic_row_query";

// USERS (mostly just pull directly from DB.user_map for now)

export function is_me(user_id: number): boolean {
    return user_id === DB.current_user_id;
}

export function current_user_name(): string {
    return DB.user_map.get(DB.current_user_id)!.full_name;
}

export function current_user_is_admin(): boolean {
    return DB.user_map.get(DB.current_user_id)?.is_admin ?? false;
}

// STREAMS
//
export function get_channel_rows(): ChannelRow[] {
    return channel_row_query.get_rows(DB.channel_map, [
        ...DB.message_map.values(),
    ]);
}

export function stream_for(stream_id: number): Stream {
    return DB.channel_map.get(stream_id)!;
}

export function channel_id_for(channel_name: string): number | undefined {
    const channel_map = DB.channel_map;

    // TODO: maintain reverse map? (probably rarely needed)
    for (const channel_id of channel_map.keys()) {
        if (channel_map.get(channel_id)!.name === channel_name) {
            return channel_id;
        }
    }
    return undefined;
}

export function stream_name_for(stream_id: number): string {
    return stream_for(stream_id).name;
}

// TOPICS

export function messages_for_topic(topic_id: number): Message[] {
    // The index can return false positives, so be careful (due
    // to topic moves), but it will be a superset of the ids
    // that match on topic (and generally much smaller than the
    // entire collection of messages we have fetched).
    const message_ids =
        DB.message_index.candidate_message_ids_for_topic_id(topic_id);

    const result = [];

    for (const message_id of message_ids) {
        const message = DB.message_map.get(message_id);
        if (message) {
            if (message.topic_id === topic_id) {
                result.push(message);
            }
        }
    }

    result.sort((m1, m2) => m1.id - m2.id);

    return result;
}

export function get_topic_rows(stream_id: number): TopicRow[] {
    function predicate(message: Message) {
        return message.stream_id === stream_id;
    }
    const messages = filtered_messages({ predicate });
    return topic_row_query.get_rows(DB.topic_map, messages);
}

// MESSAGES

export function all_messages(): Message[] {
    return [...DB.message_map.values()];
}

export function messages_grouped_by_topic(): Map<number, Message[]> {
    const map = new Map<number, Message[]>();
    for (const message of DB.message_map.values()) {
        const topic_id = message.topic_id;
        const group = map.get(topic_id);
        if (group) {
            group.push(message);
        } else {
            map.set(topic_id, [message]);
        }
    }
    return map;
}

export function filtered_messages(filter: Filter): Message[] {
    const result = [];
    for (const message of DB.message_map.values()) {
        if (filter.predicate(message)) {
            result.push(message);
        }
    }
    result.sort((m1, m2) => m1.id - m2.id);
    return result;
}

export function get_total_unread_count(): number {
    let count = 0;
    for (const message of DB.message_map.values()) {
        if (message.unread) {
            ++count;
        }
    }
    return count;
}

// MISC
//
export function participants_for_messages(messages: Message[]): User[] {
    const map = new Map<number, number>();

    for (const message of messages) {
        const sender_id = message.sender_id;
        const count = (map.get(sender_id) ?? 0) + 1;
        map.set(sender_id, count);
    }

    const sender_ids = [...map.keys()];

    sender_ids.sort((s1, s2) => map.get(s2)! - map.get(s1)!);

    // we still need system bots
    return sender_ids
        .map((sender_id) => DB.user_map.get(sender_id)!)
        .filter((user) => user !== undefined);
}
