// Buddy list — a small set of user IDs persisted to localStorage.
// The full user population comes from DB.user_map (message senders).

import { DB } from "./backend/database";
import type { User } from "./backend/db_types";
import * as dm_model from "./dm/model";
import * as local_storage from "./localstorage";

const STORAGE_KEY = "buddy_list";

let buddy_ids: Set<number> = load();
let listener: (() => void) | undefined;

function load(): Set<number> {
    const raw = local_storage.get(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw);
    return new Set<number>(parsed.ids ?? []);
}

function save(): void {
    local_storage.set(STORAGE_KEY, { ids: [...buddy_ids] });
}

export function on_change(callback: () => void): void {
    listener = callback;
}

export function get_all_users(): User[] {
    const users = [...DB.user_map.values()];
    users.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return users;
}

export function get_message_sender_ids(): Set<number> {
    const ids = new Set<number>();
    for (const msg of DB.message_map.values()) {
        ids.add(msg.sender_id);
    }
    for (const msg of dm_model.get_messages()) {
        ids.add(msg.sender_id);
    }
    return ids;
}

export function get_buddies(): User[] {
    return get_all_users().filter((u) => buddy_ids.has(u.id));
}

export function is_buddy(user_id: number): boolean {
    return buddy_ids.has(user_id);
}

export function add_buddy(user_id: number): void {
    buddy_ids.add(user_id);
    save();
    listener?.();
}

export function remove_buddy(user_id: number): void {
    buddy_ids.delete(user_id);
    save();
    listener?.();
}

export function toggle_buddy(user_id: number): void {
    if (buddy_ids.has(user_id)) {
        remove_buddy(user_id);
    } else {
        add_buddy(user_id);
    }
}
