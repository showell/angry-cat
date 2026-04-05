import { TopicRow } from "../topic_row";
import type { Message } from "./db_types";
import { MessageList } from "./message_list";
import type { TopicMap } from "./topic_map";

export function get_rows(topic_map: TopicMap, messages: Message[]): TopicRow[] {
    const message_list_map = new Map<number, MessageList>();

    for (const message of messages) {
        const topic_id = message.topic_id;

        const message_list =
            message_list_map.get(topic_id) ?? new MessageList();

        message_list.push(message);
        message_list_map.set(topic_id, message_list);
    }

    const topic_rows: TopicRow[] = [];

    for (const topic_id of message_list_map.keys()) {
        const message_list = message_list_map.get(topic_id)!;
        const list_info = message_list.list_info();
        const topic = topic_map.get(topic_id);

        const topic_row = new TopicRow(topic, list_info);

        topic_rows.push(topic_row);
    }

    return topic_rows;
}
