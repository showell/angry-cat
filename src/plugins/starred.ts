// Starred Messages plugin — shows all starred messages with per-message
// actions:
//
//   Unstar (soft): dims the message to 50% opacity and waits for the
//     server event to confirm. Shows a spinner while waiting. Once
//     confirmed, replaces Unstar with Restar. The message stays visible
//     so the user can review their full list without losing context.
//
//   Restar: re-stars a previously unstarred message (same wait pattern).
//
//   Dismiss (hard): unstars AND immediately hides the message from the
//     list. For messages the user is done with entirely.

import { APP } from "../app";
import { is_starred } from "../backend/database";
import type { Message } from "../backend/db_types";
import type { ZulipEvent } from "../backend/event";
import { EventFlavor } from "../backend/event";
import { MessageRow } from "../backend/message_row";
import * as zulip_client from "../backend/zulip_client";
import { Button } from "../button";
import * as colors from "../colors";
import { render_message_content } from "../message_content";
import type { Plugin, PluginContext } from "../plugin_helper";
import * as reading_list from "./reading_list";
import {
    ButtonState,
    StarredPluginModel,
    type StarredMessageState,
} from "./starred_model";

// --- Rendering ---

function render_starred_message(
    state: StarredMessageState,
    model: StarredPluginModel,
    on_rebuild: () => void,
): HTMLDivElement {
    const message = state.message;
    const message_row = new MessageRow(message);

    const div = document.createElement("div");
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;
    div.style.paddingBottom = "8px";
    div.style.marginBottom = "8px";

    // Content area dims on unstar; buttons stay at full opacity.
    const content_area = document.createElement("div");
    content_area.style.transition = "opacity 0.3s ease";
    div.append(content_area);

    const header = document.createElement("div");
    header.style.fontWeight = "bold";
    header.style.color = colors.primary;
    header.style.marginBottom = "2px";

    const time = new Date(message.timestamp * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    header.innerText = `${message_row.sender_name()} — ${message_row.topic_link()} — ${time}`;
    content_area.append(header);
    content_area.append(render_message_content(message_row.content()));

    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "6px";
    button_row.style.marginTop = "4px";
    button_row.style.alignItems = "center";
    div.append(button_row);

    const spinner = document.createElement("span");
    spinner.innerText = "waiting...";
    spinner.style.fontSize = "13px";
    spinner.style.color = colors.text_muted;

    const view_topic_button = new Button("View Topic", 100, () => {
        APP.add_navigator(message_row.address());
    });

    function show_starred_buttons(): void {
        button_row.innerHTML = "";
        const unstar_button = new Button("Unstar", 80, () => {
            state.request_unstar();
            zulip_client.set_message_starred(message.id, false);
            render_current_state();
        });
        const dismiss_button = new Button("Dismiss", 80, () => {
            zulip_client.set_message_starred(message.id, false);
            model.dismiss(message.id);
            on_rebuild();
        });
        button_row.append(unstar_button.div, dismiss_button.div, view_topic_button.div);
    }

    function show_unstarred_buttons(): void {
        button_row.innerHTML = "";
        content_area.style.opacity = "0.5";
        const restar_button = new Button("Restar", 80, () => {
            state.request_restar();
            zulip_client.set_message_starred(message.id, true);
            render_current_state();
        });
        const dismiss_button = new Button("Dismiss", 80, () => {
            model.dismiss(message.id);
            on_rebuild();
        });
        button_row.append(restar_button.div, dismiss_button.div, view_topic_button.div);
    }

    function show_pending(): void {
        button_row.innerHTML = "";
        button_row.append(spinner);
    }

    function render_current_state(): void {
        switch (state.button_state) {
            case ButtonState.STARRED:
                content_area.style.opacity = "1";
                show_starred_buttons();
                break;
            case ButtonState.PENDING:
                show_pending();
                break;
            case ButtonState.UNSTARRED:
                show_unstarred_buttons();
                break;
        }
    }

    render_current_state();

    return Object.assign(div, { render_current_state });
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No starred messages.";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

type StarredMessageDiv = HTMLDivElement & {
    render_current_state: () => void;
};

function build_cat_tip(): HTMLDivElement {
    const div = document.createElement("div");
    div.style.marginTop = "20px";
    div.style.padding = "12px";
    div.style.border = `1px solid ${colors.accent_border}`;
    div.style.borderRadius = "8px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "10px";
    header.style.marginBottom = "8px";

    const avatar = document.createElement("img");
    avatar.src = "images/angry_cat.png";
    avatar.style.width = "40px";
    avatar.style.height = "40px";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";

    const name = document.createElement("span");
    name.innerText = "Angry Cat says:";
    name.style.fontWeight = "bold";
    name.style.color = colors.primary;

    header.append(avatar, name);
    div.append(header);

    const tip = document.createElement("div");
    tip.style.fontSize = "14px";
    tip.style.color = colors.text_body;
    tip.style.lineHeight = "1.5";
    tip.style.marginBottom = "10px";
    tip.innerText =
        "Starred messages are great for quick bookmarks, but for " +
        "organizing your reading queue, try the Reading List! You " +
        "can drag items to reorder them and check them off as you go.";
    div.append(tip);

    const launch_button = new Button("Open Reading List", 160, () => {
        APP.add_plugin(reading_list.plugin);
    });
    div.append(launch_button.div);

    return div;
}

function build_stats(model: StarredPluginModel): HTMLDivElement {
    const div = document.createElement("div");
    div.style.fontSize = "15px";
    div.style.color = colors.text_body;
    div.style.lineHeight = "1.8";

    const total = model.messages.length;
    const starred_count = model.starred_count;
    const unstarred_count = model.unstarred_count;

    const summary = document.createElement("div");
    summary.style.marginBottom = "16px";
    summary.innerHTML = [
        `<b>${total}</b> starred message${total === 1 ? "" : "s"}`,
        starred_count > 0 ? `<b>${starred_count}</b> still starred` : "",
        unstarred_count > 0 ? `<b>${unstarred_count}</b> unstarred` : "",
    ]
        .filter(Boolean)
        .join("<br>");
    div.append(summary);

    const counts = model.counts_by_topic;
    if (counts.length > 0) {
        const heading = document.createElement("div");
        heading.style.fontWeight = "bold";
        heading.style.color = colors.primary;
        heading.style.marginBottom = "4px";
        heading.innerText = "By topic";
        div.append(heading);

        for (const { label, count } of counts) {
            const line = document.createElement("div");
            line.innerText = `${label}: ${count}`;
            div.append(line);
        }
    }

    return div;
}

// --- Plugin entry point ---

export function plugin(context: PluginContext): Plugin {
    context.update_label("Starred");

    const model = new StarredPluginModel();

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.gap = "20px";
    div.style.paddingTop = "15px";
    div.style.height = "100%";

    const left_pane = document.createElement("div");
    left_pane.style.flex = "1";
    left_pane.style.overflow = "auto";
    left_pane.style.maxWidth = "700px";

    const right_pane = document.createElement("div");
    right_pane.style.width = "350px";
    right_pane.style.flexShrink = "0";
    right_pane.style.paddingTop = "4px";
    right_pane.style.overflow = "auto";

    div.append(left_pane, right_pane);

    let message_divs: StarredMessageDiv[] = [];

    function refresh_stats(): void {
        right_pane.innerHTML = "";
        right_pane.append(build_cat_tip());
        right_pane.append(build_stats(model));
    }

    function rebuild(): void {
        model.refresh();

        left_pane.innerHTML = "";
        message_divs = [];
        if (model.message_states.length === 0) {
            left_pane.append(build_empty_message());
        } else {
            for (const state of model.message_states) {
                const msg_div = render_starred_message(
                    state,
                    model,
                    rebuild,
                ) as StarredMessageDiv;
                left_pane.append(msg_div);
                message_divs.push(msg_div);
            }
        }

        refresh_stats();
    }

    rebuild();

    function handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor !== EventFlavor.MUTATE_STARRED) return;

        for (let i = 0; i < model.message_states.length; i++) {
            const changed = model.message_states[i].handle_star_event();
            if (changed) {
                message_divs[i].render_current_state();
            }
        }

        refresh_stats();

        if (event.starred) {
            rebuild();
        }
    }

    return { div, handle_zulip_event };
}
