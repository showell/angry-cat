import type { Page } from "./page";
import type { PluginHelper } from "./plugin_helper";

import * as tab_button_widget from "./dom/tab_button_widget";

export class TabButton {
    plugin_helper: PluginHelper;
    tab_button: HTMLElement;
    div: HTMLDivElement;

    constructor(plugin_helper: PluginHelper, page: Page) {
        const div = document.createElement("div");

        const tab_button = tab_button_widget.tab_button();

        this.plugin_helper = plugin_helper;
        this.div = div;
        this.tab_button = tab_button;

        tab_button.addEventListener("click", () => {
            page.make_plugin_active(plugin_helper);
        });

        div.append(tab_button);

        this.refresh();
    }

    refresh(): void {
        const tab_button = this.tab_button;
        const plugin_helper = this.plugin_helper;

        tab_button.innerText = plugin_helper.label;

        if (plugin_helper.open) {
            tab_button.style.backgroundColor = "white";
            tab_button.style.borderBottom = "1px white solid";
            tab_button.style.color = "#000080";
        } else {
            tab_button.style.backgroundColor = "lightgray";
            tab_button.style.borderBottom = "1px black solid";
            tab_button.style.color = "#0000B0";
        }
    }

    violet(): void {
        this.tab_button.style.backgroundColor = "violet";
    }
}
