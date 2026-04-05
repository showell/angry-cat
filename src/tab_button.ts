import * as colors from "./colors";
import * as tab_button_widget from "./dom/tab_button_widget";
import type { Page } from "./page";
import type { PluginHelper } from "./plugin_helper";

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
            tab_button.style.backgroundColor = colors.surface;
            tab_button.style.borderBottom = `1px ${colors.surface} solid`;
            tab_button.style.color = colors.primary;
        } else {
            tab_button.style.backgroundColor = colors.tab_inactive_bg;
            tab_button.style.borderBottom = `1px ${colors.border} solid`;
            tab_button.style.color = colors.primary;
        }
    }

    violet(): void {
        this.tab_button.style.backgroundColor = colors.new_message_border;
    }
}
