// DM (direct message) data model — intentionally separate from the
// channel/topic model. Shared user data comes from DB.user_map.

import { DB } from "../backend/database";

export type DirectMessage = {
    id: number;
    sender_id: number;
    recipient_ids: number[];
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

export function user_name(user_id: number): string {
    return DB.user_map.get(user_id)?.full_name ?? "Unknown";
}

export function recipient_names(msg: DirectMessage): string {
    const current_user = DB.current_user_id;
    const others = msg.recipient_ids.filter((id) => id !== current_user);
    if (others.length === 0) return "you (self)";
    return others.map((id) => user_name(id)).join(", ");
}
