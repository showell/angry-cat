import type { Address } from "./address";
import { DB } from "./backend/database";
import type { Message } from "./backend/db_types";
import * as model from "./backend/model";

export class MessageRow {
    _message: Message;

    constructor(message: Message) {
        this._message = message;
    }

    address(): Address {
        return {
            channel_id: this.channel_id(),
            topic_id: this.topic_id(),
            message_id: this.message_id(),
        };
    }

    message_id(): number {
        return this._message.id;
    }

    sender_name(): string {
        const message = this._message;

        const user = DB.user_map.get(message.sender_id);
        if (user) {
            return user.full_name;
        } else {
            // TODO: system bots
            return "unknown";
        }
    }

    sender_mention(): string {
        const name = this.sender_name();

        return `@**${name}**`;
    }

    stream_name(): string {
        return model.stream_name_for(this._message.stream_id);
    }

    timestamp(): number {
        return this._message.timestamp;
    }

    channel_id(): number {
        return this._message.stream_id;
    }

    topic_id(): number {
        return this._message.topic_id;
    }

    topic_name(): string {
        const topic = DB.topic_map.get(this.topic_id());
        return topic.topic_name;
    }

    channel_link(): string {
        const channel_name = this.stream_name();
        return `#**${channel_name}**`;
    }

    channel_topic(): string {
        const channel_name = this.stream_name();
        const topic_name = this.topic_name();
        return `#${channel_name} > ${topic_name}`;
    }

    topic_link(): string {
        const channel_name = this.stream_name();
        const topic_name = this.topic_name();
        return `#**${channel_name}>${topic_name}**`;
    }

    message_link(): string {
        // #**Angry Cat (Zulip client)>commits@573999073**
        const channel_name = this.stream_name();
        const topic_name = this.topic_name();
        const message_id = this.message_id();
        return `#**${channel_name}>${topic_name}@${message_id}**`;
    }

    content(): string {
        return this._message.content;
    }

    unread(): boolean {
        return this._message.unread;
    }

    is_super_new(): boolean {
        return this._message.is_super_new;
    }

    address_string(): string {
        const stream_name = this.stream_name();
        const topic_name = this.topic_name();

        return `#${stream_name} > ${topic_name}`;
    }
}
