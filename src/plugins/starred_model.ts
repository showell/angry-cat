// Pure logic for the Starred Messages plugin, separated from DOM.
//
// StarredMessageState tracks the button state machine for one message.
// StarredPluginModel manages the overall list, dismissed set, and stats.

import { DB, is_starred } from "../backend/database";
import type { Message } from "../backend/db_types";
import { MessageRow } from "../backend/message_row";

// --- Per-message state machine ---

export enum ButtonState {
    STARRED,    // show Unstar + Dismiss + View Topic
    PENDING,    // show spinner (waiting for server confirmation)
    UNSTARRED,  // show Restar + Dismiss + View Topic
}

export class StarredMessageState {
    message: Message;
    button_state: ButtonState;

    // What starred value we're waiting for the server to confirm.
    // null means not waiting.
    private pending_starred: boolean | null = null;

    constructor(message: Message) {
        this.message = message;
        this.button_state = ButtonState.STARRED;
    }

    request_unstar(): void {
        this.pending_starred = false;
        this.button_state = ButtonState.PENDING;
    }

    request_restar(): void {
        this.pending_starred = true;
        this.button_state = ButtonState.PENDING;
    }

    // Called when a MUTATE_STARRED event arrives. Returns true if
    // the state changed (the DOM should update).
    handle_star_event(): boolean {
        if (this.pending_starred === null) return false;

        const starred = is_starred(this.message.id);
        if (starred !== this.pending_starred) return false;

        this.pending_starred = null;
        this.button_state = starred
            ? ButtonState.STARRED
            : ButtonState.UNSTARRED;
        return true;
    }
}

// --- Plugin-level model ---

export type TopicCount = {
    label: string;
    count: number;
};

export class StarredPluginModel {
    dismissed_ids: Set<number>;
    message_states: StarredMessageState[];

    constructor() {
        this.dismissed_ids = new Set();
        this.message_states = [];
    }

    // Rebuild the message list from the current DB state.
    refresh(): void {
        const messages: Message[] = [];
        for (const message of DB.message_map.values()) {
            if (is_starred(message.id) && !this.dismissed_ids.has(message.id)) {
                messages.push(message);
            }
        }
        messages.sort((a, b) => b.timestamp - a.timestamp);

        this.message_states = messages.map((m) => new StarredMessageState(m));
    }

    dismiss(message_id: number): void {
        this.dismissed_ids.add(message_id);
    }

    get messages(): Message[] {
        return this.message_states.map((s) => s.message);
    }

    get starred_count(): number {
        return this.messages.filter((m) => is_starred(m.id)).length;
    }

    get unstarred_count(): number {
        return this.messages.length - this.starred_count;
    }

    get counts_by_topic(): TopicCount[] {
        const by_topic = new Map<string, number>();
        for (const m of this.messages) {
            if (!is_starred(m.id)) continue;
            const row = new MessageRow(m);
            const key = `#${row.stream_name()} > ${row.topic_name()}`;
            by_topic.set(key, (by_topic.get(key) ?? 0) + 1);
        }
        return [...by_topic.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }
}
