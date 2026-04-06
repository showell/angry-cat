import { APP } from "../app";
import type { Plugin, PluginContext, PluginFactory } from "../plugin_helper";

import * as code_search from "./code_search";
import * as color_scheme from "./color_scheme";
import * as event_radio from "./event_radio";
import * as github_search from "./github_search";

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");

    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.gap = "10px";

    function add_plugin(name: string, plugin_maker: PluginFactory) {
        const button = document.createElement("button");
        button.innerText = `Launch ${name}`;
        button.addEventListener("click", () => {
            APP.add_plugin(plugin_maker);
        });
        div.append(button);
    }

    add_plugin("Color Scheme", color_scheme.plugin);
    add_plugin("Event Radio", event_radio.plugin);
    add_plugin("Code Search", code_search.plugin);
    add_plugin("GitHub Search", github_search.plugin);

    context.update_label("Plugins");

    return { div };
}
