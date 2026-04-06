import { ChannelRow } from "./channel_row";
import type { Message, Stream } from "./db_types";
import { MessageList } from "./message_list";

export function get_rows(
    channel_map: Map<number, Stream>,
    messages: Message[],
): ChannelRow[] {
    const stream_ids = [...channel_map.keys()];
    const message_list_map = new Map<number, MessageList>();

    for (const message of messages) {
        if (message.type !== "stream") {
            continue;
        }

        const stream_id = message.stream_id;

        const message_list =
            message_list_map.get(stream_id) ?? new MessageList();

        message_list.push(message);
        message_list_map.set(stream_id, message_list);
    }

    const rows: ChannelRow[] = [];

    for (const stream_id of stream_ids) {
        const message_list =
            message_list_map.get(stream_id) ?? new MessageList();
        const list_info = message_list.list_info();
        const stream = channel_map.get(stream_id)!;
        const channel_row = new ChannelRow(stream, list_info);

        rows.push(channel_row);
    }

    return rows;
}
