import { APP } from "../app";
import * as buddy_list from "../buddy_list";
import { DB } from "../backend/database";
import type { User } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import * as model from "../backend/model";
import { adjuster } from "../batch_count";
import { Button } from "../button";
import * as colors from "../colors";
import { render_unread_count } from "../dom/render";
import * as table_widget from "../dom/table_widget";
import { render_topic_name } from "../dom/topic_row_widget";
import { render_message_content } from "../message_content";
import { MessageRow } from "../backend/message_row";
import { render_sender_name } from "../message_row_widget";
import type { Plugin, PluginContext } from "../plugin_helper";

const enum FilterMode {
    ALL = "All",
    PARTICIPATED = "Participated",
    BUDDIES = "Buddies participated",
}

const FILTER_CYCLE: FilterMode[] = [
    FilterMode.ALL,
    FilterMode.PARTICIPATED,
    FilterMode.BUDDIES,
];

function get_allowed_topic_ids(mode: FilterMode): Set<number> | undefined {
    switch (mode) {
        case FilterMode.ALL:
            return undefined;
        case FilterMode.PARTICIPATED:
            return model.topic_ids_with_participant(DB.current_user_id);
        case FilterMode.BUDDIES:
            return model.topic_ids_with_buddy_participation();
    }
}

function build_topic_cell(message_row: MessageRow): HTMLDivElement {
    const topic_name = message_row.topic_name();
    const address = message_row.address();

    const div = render_topic_name(topic_name);

    div.addEventListener("click", () => {
        APP.add_navigator(address);
    });

    return div;
}

function build_message_cell(
    topic_messages: ReturnType<typeof model.all_messages>,
    messages_per_topic: number,
): HTMLDivElement {
    const cell = document.createElement("div");
    cell.style.maxWidth = "400px";

    if (messages_per_topic === 0) {
        return cell;
    }

    const sorted = [...topic_messages].sort(
        (a, b) => b.timestamp - a.timestamp,
    );
    const to_show = sorted.slice(0, messages_per_topic);

    for (const message of to_show) {
        const message_row = new MessageRow(message);
        const block = document.createElement("div");
        if (to_show.length > 1) {
            block.style.borderBottom = `1px dotted ${colors.border_subtle}`;
            block.style.marginBottom = "4px";
            block.style.paddingBottom = "4px";
        }
        block.append(render_sender_name(message_row.sender_name()));
        block.append(render_message_content(message_row.content()));
        cell.append(block);
    }

    return cell;
}

function render_count_cell(total: number, unread_count: number): HTMLDivElement {
    const cell = document.createElement("div");
    const total_div = document.createElement("div");
    total_div.innerText = String(total);
    total_div.style.textAlign = "right";
    cell.append(total_div);
    if (unread_count > 0) {
        cell.append(render_unread_count(unread_count));
    }
    return cell;
}

function get_recent_message_rows(
    allowed_topic_ids: Set<number> | undefined,
): MessageRow[] {
    const messages = model.all_messages();
    messages.sort((a, b) => b.timestamp - a.timestamp);

    const used_topic_ids = new Set<number>();
    const result: MessageRow[] = [];

    for (const message of messages) {
        const topic_id = message.topic_id;
        if (used_topic_ids.has(topic_id)) continue;
        if (allowed_topic_ids !== undefined && !allowed_topic_ids.has(topic_id))
            continue;
        used_topic_ids.add(topic_id);
        result.push(new MessageRow(message));
        if (result.length >= 30) break;
    }

    return result;
}

function sort_participants(participants: User[]): User[] {
    const buddies = participants
        .filter((u) => buddy_list.is_buddy(u.id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const others = participants
        .filter((u) => !buddy_list.is_buddy(u.id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    return [...buddies, ...others];
}

function build_senders_cell(
    participants: User[],
    compact: boolean,
): HTMLDivElement {
    const div = document.createElement("div");
    const sorted = sort_participants(participants);

    if (compact) {
        for (let i = 0; i < sorted.length; i++) {
            const span = document.createElement("span");
            span.innerText = sorted[i].full_name;
            if (buddy_list.is_buddy(sorted[i].id)) {
                span.style.fontWeight = "bold";
            }
            div.append(span);
            if (i < sorted.length - 1) {
                div.append(", ");
            }
        }
    } else {
        for (const user of sorted) {
            const row = document.createElement("div");
            row.innerText = user.full_name;
            if (buddy_list.is_buddy(user.id)) {
                row.style.fontWeight = "bold";
            } else {
                row.style.fontSize = "12px";
            }
            div.append(row);
        }
    }

    return div;
}

function build_table(
    messages_per_topic: number,
    allowed_topic_ids: Set<number> | undefined,
): HTMLElement {
    const grouped = model.messages_grouped_by_topic();
    const recent_message_rows = get_recent_message_rows(allowed_topic_ids);

    const rows = [];
    for (const message_row of recent_message_rows) {
        const channel_name = message_row.stream_name();
        const topic_id = message_row.topic_id();
        const topic_messages = grouped.get(topic_id) ?? [];
        const participants = model.participants_for_messages(topic_messages);

        const unread_count = topic_messages.filter((msg) => msg.unread).length;
        const count_cell = render_count_cell(topic_messages.length, unread_count);

        const channel_cell = document.createElement("div");
        channel_cell.innerText = channel_name;
        const topic_cell = build_topic_cell(message_row);
        const senders_cell = build_senders_cell(
            participants,
            messages_per_topic === 0,
        );

        const message_cell = build_message_cell(
            topic_messages,
            messages_per_topic,
        );

        const divs = [count_cell, channel_cell, topic_cell, senders_cell];
        if (messages_per_topic > 0) {
            divs.push(message_cell);
        }

        const row_widget: table_widget.RowWidget = { divs };
        rows.push(row_widget);
    }

    const headers = ["Count", "Channel", "Topic", "Senders"];
    if (messages_per_topic === 1) {
        headers.push("Last message");
    } else if (messages_per_topic > 1) {
        headers.push("Last messages");
    }

    return table_widget.table(headers, rows);
}

function build_notification_div(on_refresh: () => void): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "none";
    div.style.alignItems = "center";
    div.style.gap = "10px";
    div.style.marginBottom = "8px";

    const text = document.createElement("span");
    text.innerText = "New messages have arrived.";

    const refresh_button = new Button("Refresh", 100, on_refresh);
    div.append(text, refresh_button.div);
    return div;
}

function build_controls_div(
    initial_count: number,
    on_change: (count: number) => void,
): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.marginBottom = "8px";

    const label = document.createElement("span");
    label.innerText = "Messages per topic:";

    const count_adjuster = adjuster({
        min: 0,
        max: 10,
        value: initial_count,
        callback: on_change,
    });

    div.append(label, count_adjuster);
    return div;
}

class RecentConversations {
    div: HTMLDivElement;
    context: PluginContext;
    notification_div: HTMLDivElement;
    inner_div: HTMLDivElement;
    messages_per_topic: number;
    filter_mode: FilterMode;
    filter_label: HTMLElement;

    constructor(context: PluginContext) {
        this.context = context;
        this.messages_per_topic = 1;
        this.filter_mode = FilterMode.ALL;

        const notification_div = build_notification_div(() => this.refresh());

        const filter_label = document.createElement("span");
        filter_label.innerText = this.filter_mode;
        this.filter_label = filter_label;

        const filter_button = new Button("Filter", 80, () => {
            const idx = FILTER_CYCLE.indexOf(this.filter_mode);
            this.filter_mode = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
            this.filter_label.innerText = this.filter_mode;
            this.rebuild_table();
        });

        const filter_div = document.createElement("div");
        filter_div.style.display = "flex";
        filter_div.style.alignItems = "center";
        filter_div.style.gap = "8px";
        filter_div.style.marginBottom = "8px";
        filter_div.append(filter_button.div, filter_label);

        const controls_div = build_controls_div(
            this.messages_per_topic,
            (count) => {
                this.messages_per_topic = count;
                this.rebuild_table();
            },
        );

        const inner_div = document.createElement("div");
        inner_div.style.maxHeight = "82vh";
        inner_div.style.overflow = "auto";
        inner_div.append(
            build_table(
                this.messages_per_topic,
                get_allowed_topic_ids(this.filter_mode),
            ),
        );

        const div = document.createElement("div");
        div.style.paddingTop = "15px";
        div.style.maxHeight = "fit-content";
        div.style.maxWidth = "fit-content";

        div.append(notification_div, filter_div, controls_div, inner_div);

        this.div = div;
        this.notification_div = notification_div;
        this.inner_div = inner_div;
    }

    rebuild_table(): void {
        this.inner_div.innerHTML = "";
        this.inner_div.append(
            build_table(
                this.messages_per_topic,
                get_allowed_topic_ids(this.filter_mode),
            ),
        );
    }

    handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MESSAGE) {
            this.notification_div.style.display = "flex";
            this.context.highlight_tab();
        }
    }

    refresh(): void {
        this.notification_div.style.display = "none";
        this.context.reset_tab_highlight();
        this.rebuild_table();
    }
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Recent conversations");

    const widget = new RecentConversations(context);

    return {
        div: widget.div,
        handle_zulip_event: (event) => widget.handle_zulip_event(event),
    };
}
