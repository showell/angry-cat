// Bot Management plugin — shows the user's bots on the Zulip instance.
// Uses GET /bots to fetch the bot list.

import { api_get } from "../backend/api_helpers";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";

type Bot = {
    bot_type: number;
    email: string;
    full_name: string;
    is_active: boolean;
    user_id: number;
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

    const email_div = document.createElement("div");
    email_div.style.color = colors.text_muted;
    email_div.style.fontSize = "14px";
    email_div.innerText = bot.email;

    const status_div = document.createElement("div");
    status_div.style.fontSize = "13px";
    status_div.style.marginLeft = "auto";
    status_div.innerText = bot.is_active ? "Active" : "Inactive";
    status_div.style.color = bot.is_active ? colors.success : colors.text_muted;

    const info = document.createElement("div");
    info.append(name_div, email_div);
    info.style.flex = "1";

    div.append(info, status_div);
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
