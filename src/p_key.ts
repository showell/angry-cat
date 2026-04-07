// The 'p' key opens a popup to launch optional plugins.
//
// Navigation: first plugin button is auto-focused. Arrow keys and Tab
// navigate via normal browser behavior. ESC focuses the Cancel button;
// pressing ESC or Enter when Cancel is focused closes the dialog.

import { APP } from "./app";
import * as model from "./backend/model";
import { Button } from "./button";
import * as dm from "./dm/plugin";
import * as lyn_rummy from "./lyn_rummy/plugin";
import type { PluginFactory } from "./plugin_helper";
import * as activity from "./plugins/activity";
import * as admin from "./plugins/admin";
import * as bot_management from "./plugins/bot_management";
import * as buddies from "./plugins/buddies";
import * as code_search from "./plugins/code_search";
import * as color_scheme from "./plugins/color_scheme";
import * as config_viewer from "./plugins/config_viewer";
import * as image_search from "./plugins/image_search";
import * as mentions from "./plugins/mentions";
import * as reading_list from "./plugins/reading_list";
import * as recent_conversations from "./plugins/recent_conversations";
import * as starred from "./plugins/starred";
import * as popup from "./popup";

type PluginEntry = { name: string; factory: PluginFactory };

function get_all_plugins(): PluginEntry[] {
    const plugins: PluginEntry[] = [
        { name: "Activity", factory: activity.plugin },
        { name: "Bot Management", factory: bot_management.plugin },
        { name: "Buddies", factory: buddies.plugin },
        { name: "Code Search", factory: code_search.plugin },
        { name: "Color Scheme", factory: color_scheme.plugin },
        { name: "Config", factory: config_viewer.plugin },
        { name: "DMs", factory: dm.plugin },
        { name: "Image Search", factory: image_search.plugin },
        { name: "Lyn Rummy", factory: lyn_rummy.plugin },
        { name: "Mentions", factory: mentions.plugin },
        { name: "Reading List", factory: reading_list.plugin },
        { name: "Recent Conversations", factory: recent_conversations.plugin },
        { name: "Starred Messages", factory: starred.plugin },
    ];
    if (model.current_user_is_admin()) {
        plugins.push({ name: "Admin", factory: admin.plugin });
    }
    return plugins;
}

function get_available_plugins(): PluginEntry[] {
    return get_all_plugins().filter(
        (entry) => !APP.is_plugin_active(entry.factory),
    );
}

export function handle_p_key(): boolean {
    const available = get_available_plugins();

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.gap = "8px";
    div.style.padding = "8px 4px";

    const heading = document.createElement("div");
    heading.style.fontWeight = "bold";
    heading.style.marginBottom = "4px";

    if (available.length === 0) {
        heading.innerText = "All plugins are already open.";
    } else {
        heading.innerText = "Launch a plugin";
    }
    div.append(heading);

    const buttons: Button[] = [];

    for (const entry of available) {
        const button = new Button(entry.name, 250, () => {
            APP.add_plugin(entry.factory);
            chooser_popup.finish();
        });
        div.append(button.div);
        buttons.push(button);
    }

    const chooser_popup = popup.pop({
        div,
        confirm_button_text: "Cancel",
        callback: () => {},
    });

    const cancel_button = chooser_popup.confirm_button;
    buttons.push(cancel_button);

    chooser_popup.dialog_shell.popup_element.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (document.activeElement === cancel_button.button) {
                    chooser_popup.finish();
                } else {
                    cancel_button.focus();
                }
                return;
            }

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const current = buttons.findIndex(
                    (b) => b.button === document.activeElement,
                );
                const direction = e.key === "ArrowDown" ? 1 : -1;
                const next =
                    (current + direction + buttons.length) % buttons.length;
                buttons[next].focus();
            }
        },
    );

    if (buttons.length > 0) {
        buttons[0].focus();
    }

    return true;
}
