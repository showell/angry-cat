// Bot Management plugin — shows the user's bots on the Zulip instance.
// Uses GET /bots to fetch the bot list.

import { api_get } from "../backend/api_helpers";
import * as config from "../backend/config";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
import * as popup from "../popup";

type Bot = {
    username: string;
    full_name: string;
    api_key: string;
};

function render_bot_row(bot: Bot): HTMLDivElement {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "12px";
    div.style.padding = "8px 0";
    div.style.borderBottom = `1px solid ${colors.border_subtle}`;

    const name_div = document.createElement("div");
    name_div.style.fontWeight = "bold";
    name_div.style.color = colors.primary;
    name_div.innerText = bot.full_name;

    const username_div = document.createElement("div");
    username_div.style.color = colors.text_muted;
    username_div.style.fontSize = "14px";
    username_div.innerText = bot.username;

    const info = document.createElement("div");
    info.append(name_div, username_div);
    info.style.flex = "1";

    const creds_button = new Button("Credentials", 110, () => {
        const creds = {
            email: bot.username,
            api_key: bot.api_key,
            url: config.get_current_realm_url(),
            nickname: bot.full_name,
        };

        const popup_div = document.createElement("div");
        popup_div.style.padding = "8px 4px";

        const pre = document.createElement("pre");
        pre.innerText = JSON.stringify(creds, null, 4);
        pre.style.fontSize = "14px";
        pre.style.backgroundColor = "#f5f5f5";
        pre.style.padding = "12px";
        pre.style.borderRadius = "4px";
        pre.style.overflow = "auto";
        pre.style.userSelect = "all";
        popup_div.append(pre);

        popup.pop({
            div: popup_div,
            confirm_button_text: "Close",
            callback: () => {},
        });
    });

    div.append(info, creds_button.div);
    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Bot Management");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "600px";
    div.style.height = "100%";
    div.style.overflow = "auto";

    const heading = document.createElement("div");
    heading.innerText = "Your Bots";
    heading.style.fontSize = "20px";
    heading.style.fontWeight = "bold";
    heading.style.color = colors.primary;
    heading.style.marginBottom = "12px";
    div.append(heading);

    const list_div = document.createElement("div");
    list_div.style.color = colors.text_muted;
    list_div.innerText = "Loading bots...";
    div.append(list_div);

    // Fetch bots from the server.
    api_get("bots").then((data) => {
        list_div.innerHTML = "";
        const bots: Bot[] = data.bots ?? [];

        if (bots.length === 0) {
            list_div.innerText = "You have no bots on this realm.";
            return;
        }

        for (const bot of bots) {
            list_div.append(render_bot_row(bot));
        }
    });

    return { div };
}
