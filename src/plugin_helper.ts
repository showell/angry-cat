import { ZulipEvent } from "./backend/event";

import type { Page } from "./page";

import { TabButton } from "./tab_button";

export type Plugin = {
    div: HTMLDivElement;
    handle_event: (event: ZulipEvent) => void;
};

export type PluginMaker = (plugin_helper: PluginHelper) => Plugin;

export class PluginHelper {
    div: HTMLDivElement;
    deleted: boolean;
    page: Page;
    open: boolean;
    label: string;
    tab_button: TabButton;
    plugin: Plugin;

    constructor(plugin_maker: PluginMaker, page: Page) {
        const div = document.createElement("div");
        this.page = page;
        this.deleted = false;
        this.open = false;
        this.label = "plugin";

        this.tab_button = new TabButton(this, page);

        const plugin = plugin_maker(this);
        div.append(plugin.div);

        this.div = div;
        this.plugin = plugin;
    }

    get_plugin(): Plugin {
        return this.plugin;
    }

    delete_me(): void {
        this.tab_button.div.remove();
        this.div.remove();
        this.deleted = true;
        this.page.activate_last_plugin();
    }

    redraw_tab_button() {
        this.tab_button.refresh();
    }

    update_label(label: string) {
        this.label = label;
        this.redraw_tab_button();
    }

    violet() {
        this.tab_button.violet();
    }
}
