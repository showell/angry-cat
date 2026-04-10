// Buddy list — a small set of user IDs the user wants in their sidebar.
//
// On Gopher realms, the list is persisted server-side via
// GET/PUT /api/v1/buddies. On Zulip realms, it falls back to
// localStorage (Zulip has no buddy API).

import { api_url, get_headers, with_retry } from "./backend/api_helpers";
import { is_gopher_realm } from "./backend/config";
import { DB } from "./backend/database";
import type { User } from "./backend/db_types";
import * as dm_model from "./dm/model";
import * as local_storage from "./localstorage";

const STORAGE_KEY = "buddy_list";

let buddy_ids: Set<number> = new Set();
let listener: (() => void) | undefined;

export async function init(): Promise<void> {
    if (is_gopher_realm()) {
        buddy_ids = await load_from_server();
    } else {
        buddy_ids = load_from_storage();
    }
    listener?.();
}

function load_from_storage(): Set<number> {
    const raw = local_storage.get(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw);
    return new Set<number>(parsed.ids ?? []);
}

async function load_from_server(): Promise<Set<number>> {
    try {
        const response = await with_retry(() =>
            fetch(api_url("buddies"), { headers: get_headers() }),
        );
        const data = await response.json();
        if (data.result === "success" && Array.isArray(data.ids)) {
            return new Set<number>(data.ids);
        }
    } catch (e) {
        console.warn("Failed to load buddies from server:", e);
    }
    return new Set();
}

async function save(new_ids: Set<number>): Promise<void> {
    if (is_gopher_realm()) {
        await save_to_server(new_ids);
    } else {
        local_storage.set(STORAGE_KEY, { ids: [...new_ids] });
    }
    buddy_ids = new_ids;
    listener?.();
}

async function save_to_server(ids: Set<number>): Promise<void> {
    const url = api_url("buddies");
    const response = await with_retry(() =>
        fetch(url, {
            method: "PUT",
            headers: {
                ...get_headers(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids: [...ids] }),
        }),
    );
    const data = await response.json();
    if (data.result !== "success") {
        throw new Error(data.msg ?? "Failed to save buddies");
    }
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
    return get_all_users().filter((u) => is_buddy(u.id));
}

export function is_buddy(user_id: number): boolean {
    return user_id === DB.current_user_id || buddy_ids.has(user_id);
}

export async function toggle_buddy(user_id: number): Promise<void> {
    const new_ids = new Set(buddy_ids);
    if (new_ids.has(user_id)) {
        new_ids.delete(user_id);
    } else {
        new_ids.add(user_id);
    }
    await save(new_ids);
}
