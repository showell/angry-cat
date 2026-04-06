import { is_unread } from "./database";
import type { Message } from "./db_types";

export type ListInfo = {
    last_msg_id: number;
    count: number;
    unread_count: number;
    num_topics: number;
};

export class MessageList {
    messages: Message[];

    constructor() {
        this.messages = [];
    }

    push(message: Message): void {
        this.messages.push(message);
    }

    list_info(): ListInfo {
        const messages = this.messages;

        if (messages.length === 0) {
            return {
                last_msg_id: -1,
                count: 0,
                unread_count: 0,
                num_topics: 0,
            };
        }

        messages.sort((m1, m2) => m2.id - m1.id);
        const last_msg_id = messages[0].id;
        const count = messages.length;
        const unread_count = messages.filter((msg) => is_unread(msg.id)).length;
        const num_topics = this.num_topics();

        return { last_msg_id, count, unread_count, num_topics };
    }

    num_topics(): number {
        const messages = this.messages;
        const set = new Set<number>();

        for (const message of messages) {
            set.add(message.topic_id);
        }

        return set.size;
    }
}
