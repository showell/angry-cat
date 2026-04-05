import type { Stream } from "./backend/db_types";
import type { ListInfo } from "./backend/message_list";

export class ChannelRow {
    _channel: Stream;
    _list_info: ListInfo;

    constructor(channel: Stream, list_info: ListInfo) {
        this._channel = channel;
        this._list_info = list_info;
    }

    stream_id(): number {
        return this._channel.stream_id;
    }

    name(): string {
        return this._channel.name;
    }

    num_messages(): number {
        return this._list_info.count;
    }

    last_msg_id(): number {
        return this._list_info.last_msg_id;
    }

    unread_count(): number {
        return this._list_info.unread_count;
    }

    num_topics(): number {
        return this._list_info.num_topics;
    }

    // num_children is an alias for num_topics, used in generic sorting code.
    num_children(): number {
        return this.num_topics();
    }

    stream_weekly_traffic(): number {
        return this._channel.stream_weekly_traffic;
    }

    rendered_description(): string {
        return this._channel.rendered_description;
    }
}
