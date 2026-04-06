import { DB } from "./database";
import type { Topic } from "./db_types";
import type { ListInfo } from "./message_list";

export class TopicRow {
    _topic: Topic;
    _list_info: ListInfo;

    constructor(topic: Topic, list_info: ListInfo) {
        this._topic = topic;
        this._list_info = list_info;
    }

    stream_id(): number {
        return this._topic.channel_id;
    }

    topic_id(): number {
        return this._topic.topic_id;
    }

    stream_name(): string {
        const channel = DB.channel_map.get(this.stream_id())!;
        return channel.name;
    }

    topic(): Topic {
        return this._topic;
    }

    name(): string {
        return this._topic.topic_name;
    }

    num_messages(): number {
        return this._list_info.count;
    }

    // num_children is an alias for num_messages, used in generic sorting code.
    num_children(): number {
        return this.num_messages();
    }

    last_msg_id(): number {
        return this._list_info.last_msg_id;
    }

    unread_count(): number {
        return this._list_info.unread_count;
    }
}
