// DM (direct message) data model — intentionally separate from the
// channel/topic model. Shared user data comes from DB.user_map.
//
// On Gopher realms, DMs are loaded from the server on startup and
// sent via POST /api/v1/dm/messages. On Zulip realms, DMs arrive
// via events only (no server-side fetch or send).

import {
    api_get,
    api_form_request,
    api_url,
    get_headers,
} from "../backend/api_helpers";
import { is_gopher_realm } from "../backend/config";
import { DB } from "../backend/database";

export type DirectMessage = {
    id: number;
    sender_id: number;
    recipient_ids: number[];
    content: string;
    timestamp: number;
    unread: boolean;
};

export type Conversation = {
    id: number;
    other_user_id: number;
    full_name: string;
    message_count: number;
};

const messages: DirectMessage[] = [];
let conversations: Conversation[] = [];
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

export function get_conversations(): readonly Conversation[] {
    return conversations;
}

export async function init(): Promise<void> {
    if (!is_gopher_realm()) return;

    try {
        const data = await api_get("dm/conversations");
        if (data.result === "success" && Array.isArray(data.conversations)) {
            conversations = data.conversations;
        }
    } catch (e) {
        console.warn("Failed to load DM conversations:", e);
    }
    listener?.();
}

export async function load_messages_with(
    other_user_id: number,
): Promise<DirectMessage[]> {
    const data = await api_get("dm/messages", {
        user_id: String(other_user_id),
    });
    if (data.result !== "success" || !Array.isArray(data.messages)) {
        return [];
    }
    return data.messages.map(
        (m: { id: number; sender_id: number; content: string; timestamp: number }) => ({
            id: m.id,
            sender_id: m.sender_id,
            recipient_ids: [DB.current_user_id, other_user_id],
            content: m.content,
            timestamp: m.timestamp,
            unread: false,
        }),
    );
}

export async function send_dm(
    recipient_id: number,
    content: string,
): Promise<{ result: string; msg?: string; id?: number }> {
    const data = await api_form_request("POST", "dm/messages", {
        to: String(recipient_id),
        content,
    });
    if (data.result === "success") {
        // Refresh conversations list.
        init();
    }
    return data as { result: string; msg?: string; id?: number };
}

export function get_messages(): readonly DirectMessage[] {
    return messages;
}

export function current_user_id(): number {
    return DB.current_user_id;
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
