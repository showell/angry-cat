import * as model from "./backend/model";

import type { Message, Reaction, Stream, Topic } from "./backend/db_types.ts";
import type { ListInfo } from "./backend/message_list.ts";

import type { Address } from "./address";

import { DB } from "./backend/database";

/*
 *  In some ways this code would more logically belong in the
 *  "backend" directory (and that's where it was originally),
 *  but all of these classes are **supposed** to be consumed
 *  by our UI classes, including our plugins.
 */

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

    stream_weekly_traffic(): number {
        return this._channel.stream_weekly_traffic;
    }

    rendered_description(): string {
        return this._channel.rendered_description;
    }
}

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

    last_msg_id(): number {
        return this._list_info.last_msg_id;
    }

    unread_count(): number {
        return this._list_info.unread_count;
    }
}

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

    reactions(): Reaction[] {
        return this._message.reactions;
    }
}

export class ReactionItem {
    _reaction: Reaction;
    constructor(reaction: Reaction) {
        this._reaction = reaction;
    }

    sender_names(): string[] {
        return this._reaction.user_ids.map(
            (id) => DB.user_map.get(id)!.full_name,
        );
    }

    get_emoji() {
        return String.fromCodePoint(parseInt(this._reaction.emoji_code, 16));
    }

    reactor_count() {
        return this._reaction.user_ids.length;
    }

    toggle_reaction_from_current_user() {
        // TODO
    }
}
