// Zen mode: a calm overlay with the Angry Cat mascot, stats, and
// gentle event summaries. Toggle with 'z' or the "Back to work" button.

import * as action_log from "./action_log";
import { ActionType } from "./action_log";
import { DB } from "./backend/database";
import * as model from "./backend/model";
import { Button } from "./button";
import * as colors from "./colors";

const MAX_EVENT_LINES = 8;

let zen_div: HTMLDivElement | undefined;
let event_log: HTMLDivElement;
let stats_div: HTMLDivElement;
let on_exit: (() => void) | undefined;

function count_messages_sent_today(): number {
    const now = Date.now();
    const start_of_day = now - (now % 86_400_000);
    return action_log
        .get_entries()
        .filter(
            (e) =>
                e.action === ActionType.MESSAGE_SENT &&
                e.timestamp >= start_of_day,
        ).length;
}

function build_stats(): string[] {
    const unread = model.get_total_unread_count();
    const sent = count_messages_sent_today();
    const total = DB.message_map.size;

    const lines: string[] = [];

    if (unread === 0) {
        lines.push("You have no unread messages. Enjoy the calm.");
    } else if (unread === 1) {
        lines.push("Just 1 unread message waiting for you.");
    } else {
        lines.push(`${unread} unread messages waiting for you.`);
    }

    if (sent === 0) {
        lines.push("No messages sent yet today.");
    } else {
        lines.push(
            `You've sent ${sent} message${sent === 1 ? "" : "s"} today.`,
        );
    }

    lines.push(`${total.toLocaleString()} messages in your cache.`);

    return lines;
}

function refresh_stats(): void {
    if (!stats_div) return;
    stats_div.innerHTML = "";
    for (const line of build_stats()) {
        const div = document.createElement("div");
        div.innerText = line;
        div.style.marginBottom = "6px";
        stats_div.append(div);
    }
}

function add_event_line(text: string): void {
    if (!event_log) return;
    const line = document.createElement("div");
    line.innerText = text;
    line.style.marginBottom = "4px";
    event_log.append(line);

    while (event_log.children.length > MAX_EVENT_LINES) {
        event_log.firstChild?.remove();
    }
}

function format_time(): string {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function notify_message(sender_name: string): void {
    if (!zen_div) return;
    add_event_line(`${format_time()} — ${sender_name} sent a message.`);
    refresh_stats();
}

export function notify_event(description: string): void {
    if (!zen_div) return;
    add_event_line(`${format_time()} — ${description}`);
    refresh_stats();
}

export function is_active(): boolean {
    return zen_div !== undefined;
}

export function enter(page_div: HTMLDivElement, exit_callback: () => void): void {
    on_exit = exit_callback;
    page_div.style.display = "none";

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.height = "100vh";
    div.style.fontFamily = "sans-serif";
    div.style.padding = "40px";
    div.style.boxSizing = "border-box";
    div.style.gap = "40px";

    // Left: cat image
    {
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "flex-start";

        const img = document.createElement("img");
        img.src = "images/angry_cat.png";
        img.style.width = "350px";
        img.style.height = "auto";
        left.append(img);
        div.append(left);
    }

    // Right: stats, event log, exit button
    {
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.flexDirection = "column";
        right.style.flex = "1";
        right.style.gap = "20px";

        const heading = document.createElement("div");
        heading.innerText = "Zen Mode";
        heading.style.fontSize = "28px";
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        right.append(heading);

        stats_div = document.createElement("div");
        stats_div.style.fontSize = "18px";
        stats_div.style.color = colors.text_body;
        stats_div.style.lineHeight = "1.6";
        right.append(stats_div);
        refresh_stats();

        const event_heading = document.createElement("div");
        event_heading.innerText = "Recent activity";
        event_heading.style.fontSize = "16px";
        event_heading.style.fontWeight = "bold";
        event_heading.style.color = colors.text_muted;
        right.append(event_heading);

        event_log = document.createElement("div");
        event_log.style.fontSize = "15px";
        event_log.style.color = colors.text_body;
        event_log.style.lineHeight = "1.5";
        event_log.style.flex = "1";
        event_log.style.overflow = "auto";
        right.append(event_log);

        add_event_line(`${format_time()} — You entered zen mode.`);

        const exit_button = new Button("Back to work", 200, exit);
        right.append(exit_button.div);

        div.append(right);
    }

    document.body.append(div);
    zen_div = div;
}

export function exit(): void {
    if (!zen_div) return;
    zen_div.remove();
    zen_div = undefined;
    on_exit?.();
}
