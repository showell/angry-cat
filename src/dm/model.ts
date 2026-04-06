// DM (direct message) data model — intentionally separate from the
// channel/topic model. Shared user data comes from DB.user_map.

import { DB } from "../backend/database";

export type DirectMessage = {
    id: number;
    sender_id: number;
    content: string;
    timestamp: number;
    unread: boolean;
};

const messages: DirectMessage[] = [];
let listener: (() => void) | undefined;

export function on_change(callback: () => void): void {
    listener = callback;
}

export function add_message(msg: DirectMessage): void {
    messages.push(msg);
    listener?.();
}

export function add_messages(msgs: DirectMessage[]): void {
    for (const msg of msgs) {
        messages.push(msg);
    }
    listener?.();
}

export function get_messages(): readonly DirectMessage[] {
    return messages;
}

export function sender_name(sender_id: number): string {
    return DB.user_map.get(sender_id)?.full_name ?? "Unknown";
}
