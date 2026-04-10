import { DB } from "../backend/database";
import type { User } from "../backend/db_types";
import * as model from "../backend/model";
import type { PresenceInfo } from "../backend/zulip_client";
import * as zulip_client from "../backend/zulip_client";
import * as buddy_list from "../buddy_list";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
import { StatusBar } from "../status_bar";

type PresenceMap = Record<string, PresenceInfo>;

type PresenceLogEntry = {
    user_id: number;
    event: string; // "came online" or "went offline"
    time: Date;
};

function presence_dot(is_online: boolean): string {
    return is_online ? "\u{1F7E2}" : "\u26AA"; // green or white circle
}

function user_name_for(user_id: number): string {
    return DB.user_map.get(user_id)?.full_name ?? `User ${user_id}`;
}

function time_ago(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return "1 min ago";
    return `${minutes} min ago`;
}

function render_user_row(user: User, presences: PresenceMap): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.padding = "4px 0";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = buddy_list.is_buddy(user.id);
    checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        try {
            await buddy_list.toggle_buddy(user.id);
        } catch {
            checkbox.checked = !checkbox.checked;
            StatusBar.scold("Failed to update buddy list");
        }
        checkbox.disabled = false;
    });

    const dot = document.createElement("span");
    const is_online = String(user.id) in presences;
    dot.textContent = presence_dot(is_online);
    dot.title = is_online ? "online" : "offline";

    const name = document.createElement("span");
    name.innerText = user.full_name;

    div.append(checkbox, dot, name);
    return div;
}

function render_section_header(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = text;
    div.style.fontWeight = "bold";
    div.style.color = colors.text_body;
    div.style.padding = "8px 0 4px";
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.marginBottom = "4px";
    return div;
}

function build_user_list(
    current_users: User[],
    other_users: User[],
    presences: PresenceMap,
): HTMLDivElement {
    const div = document.createElement("div");

    if (current_users.length > 0) {
        div.append(render_section_header("Current users"));
        for (const user of current_users) {
            div.append(render_user_row(user, presences));
        }
    }

    if (other_users.length > 0) {
        div.append(render_section_header("Other users"));
        for (const user of other_users) {
            div.append(render_user_row(user, presences));
        }
    }

    return div;
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No users found. Messages need to load first.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Buddies");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";
    div.style.maxWidth = "400px";

    const self_div = document.createElement("div");
    self_div.style.color = colors.primary;
    self_div.style.fontWeight = "bold";
    self_div.style.marginBottom = "8px";
    self_div.innerText = `${model.current_user_name()} -- you are your own buddy.`;

    const count_div = document.createElement("div");
    count_div.style.fontWeight = "bold";
    count_div.style.color = colors.primary;
    count_div.style.marginBottom = "8px";

    const list_div = document.createElement("div");
    const log_div = document.createElement("div");

    div.append(self_div, count_div, list_div, log_div);

    function update_count(): void {
        const other_buddy_count = buddy_list.get_buddies().filter(
            (u) => u.id !== DB.current_user_id,
        ).length;
        count_div.innerText = `${other_buddy_count} other buddy${other_buddy_count === 1 ? "" : "s"} selected`;
    }

    function rebuild_list(presences: PresenceMap): void {
        const me = DB.current_user_id;
        const users = buddy_list.get_all_users().filter((u) => u.id !== me);
        const sender_ids = buddy_list.get_message_sender_ids();

        const current_users = users.filter((u) => sender_ids.has(u.id));
        const other_users = users.filter((u) => !sender_ids.has(u.id));

        list_div.innerHTML = "";
        if (users.length === 0) {
            list_div.append(build_empty_message());
        } else {
            list_div.append(build_user_list(current_users, other_users, presences));
        }
    }

    // --- Local presence event log ---

    let prev_online = new Set<string>();
    const presence_log: PresenceLogEntry[] = [];
    const MAX_LOG_ENTRIES = 20;

    function diff_presence(presences: PresenceMap): void {
        const now_online = new Set(Object.keys(presences));

        // Detect who came online.
        for (const uid of now_online) {
            if (!prev_online.has(uid)) {
                const name = user_name_for(parseInt(uid));
                presence_log.push({
                    user_id: parseInt(uid),
                    event: "came online",
                    time: new Date(),
                });
                StatusBar.inform(`${name} came online`);
            }
        }

        // Detect who went offline.
        for (const uid of prev_online) {
            if (!now_online.has(uid)) {
                const name = user_name_for(parseInt(uid));
                presence_log.push({
                    user_id: parseInt(uid),
                    event: "went offline",
                    time: new Date(),
                });
                StatusBar.inform(`${name} went offline`);
            }
        }

        // Trim to max size.
        while (presence_log.length > MAX_LOG_ENTRIES) {
            presence_log.shift();
        }

        prev_online = now_online;
    }

    function render_log(): void {
        log_div.innerHTML = "";

        if (presence_log.length === 0) return;

        log_div.append(render_section_header("Presence activity"));

        // Show newest first.
        for (let i = presence_log.length - 1; i >= 0; i--) {
            const entry = presence_log[i];
            const row = document.createElement("div");
            row.style.padding = "2px 0";
            row.style.fontSize = "13px";
            row.style.color = colors.text_muted;

            const name = user_name_for(entry.user_id);
            row.textContent = `${name} ${entry.event} — ${time_ago(entry.time)}`;
            log_div.append(row);
        }
    }

    buddy_list.on_change(update_count);
    update_count();

    async function refresh_presence() {
        try {
            const presences = await zulip_client.get_presence();
            diff_presence(presences);
            rebuild_list(presences);
            render_log();
        } catch {
            rebuild_list({});
        }
    }

    refresh_presence();
    setInterval(refresh_presence, 60_000);

    return {
        div,
        refresh() {
            refresh_presence();
        },
    };
}
