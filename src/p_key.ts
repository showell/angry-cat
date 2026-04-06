// The 'p' key opens a popup to launch optional plugins.

import { APP } from "./app";
import * as model from "./backend/model";
import type { PluginFactory } from "./plugin_helper";
import * as popup from "./popup";

import * as activity from "./plugins/activity";
import * as admin from "./plugins/admin";
import * as buddies from "./plugins/buddies";
import * as code_search from "./plugins/code_search";
import * as color_scheme from "./plugins/color_scheme";
import * as dm from "./dm/plugin";
import * as github_search from "./plugins/github_search";
import * as image_search from "./plugins/image_search";
import * as reading_list from "./plugins/reading_list";

type PluginEntry = { name: string; factory: PluginFactory };

function get_plugins(): PluginEntry[] {
    const plugins: PluginEntry[] = [
        { name: "Activity", factory: activity.plugin },
        { name: "Buddies", factory: buddies.plugin },
        { name: "Code Search", factory: code_search.plugin },
        { name: "Color Scheme", factory: color_scheme.plugin },
        { name: "DMs", factory: dm.plugin },
        { name: "GitHub Search", factory: github_search.plugin },
        { name: "Image Search", factory: image_search.plugin },
        { name: "Reading List", factory: reading_list.plugin },
    ];
    if (model.current_user_is_admin()) {
        plugins.push({ name: "Admin", factory: admin.plugin });
    }
    return plugins;
}

export function handle_p_key(): boolean {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.gap = "8px";
    div.style.padding = "8px 4px";

    const heading = document.createElement("div");
    heading.innerText = "Launch a plugin";
    heading.style.fontWeight = "bold";
    heading.style.marginBottom = "4px";
    div.append(heading);

    for (const entry of get_plugins()) {
        const button = document.createElement("button");
        button.innerText = entry.name;
        button.style.textAlign = "left";
        button.style.padding = "6px 10px";
        button.style.cursor = "pointer";
        button.addEventListener("click", () => {
            APP.add_plugin(entry.factory);
            chooser_popup.finish();
        });
        div.append(button);
    }

    const chooser_popup = popup.pop({
        div,
        confirm_button_text: "Cancel",
        callback: () => {},
    });

    return true;
}
