import type { Topic } from "./db_types";

export class TopicMap {
    map: Map<number, Topic>; // topic id -> topic
    key_map: Map<string, Topic>; // key -> topic
    seq: number;

    constructor() {
        this.seq = 0;
        this.map = new Map<number, Topic>();
        this.key_map = new Map<string, Topic>();
    }

    get(id: number): Topic {
        return this.map.get(id)!;
    }

    get_or_make_topic_for(channel_id: number, topic_name: string): Topic {
        const key_map = this.key_map;

        const key = `${channel_id},${topic_name}`;
        const existing_topic = key_map.get(key);

        if (existing_topic) {
            return existing_topic;
        }

        this.seq += 1;
        const topic = { topic_id: this.seq, channel_id, topic_name };
        this.key_map.set(key, topic);
        this.map.set(topic.topic_id, topic);

        return topic;
    }

    get_topic_id(channel_id: number, topic_name: string): number {
        return this.get_or_make_topic_for(channel_id, topic_name).topic_id;
    }

    // Read-only lookup — returns undefined if the topic hasn't been
    // seen yet (no messages fetched for it).
    find_topic(channel_id: number, topic_name: string): Topic | undefined {
        const key = `${channel_id},${topic_name}`;
        return this.key_map.get(key);
    }
}
