// The 'p' key opens a popup to launch optional plugins.

import { APP } from "./app";
import type { PluginFactory } from "./plugin_helper";
import * as popup from "./popup";

import * as code_search from "./plugins/code_search";
import * as color_scheme from "./plugins/color_scheme";
import * as event_radio from "./plugins/event_radio";
import * as github_search from "./plugins/github_search";
import * as image_search from "./plugins/image_search";

type PluginEntry = { name: string; factory: PluginFactory };

const PLUGINS: PluginEntry[] = [
    { name: "Color Scheme", factory: color_scheme.plugin },
    { name: "Event Radio", factory: event_radio.plugin },
    { name: "Code Search", factory: code_search.plugin },
    { name: "GitHub Search", factory: github_search.plugin },
    { name: "Image Search", factory: image_search.plugin },
];

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

    let launched = false;

    for (const entry of PLUGINS) {
        const button = document.createElement("button");
        button.innerText = entry.name;
        button.style.textAlign = "left";
        button.style.padding = "6px 10px";
        button.style.cursor = "pointer";
        button.addEventListener("click", () => {
            launched = true;
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
