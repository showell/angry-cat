import type { ZulipEvent } from "./backend/event";

import type { Page } from "./page";

import { TabButton } from "./tab_button";

export type Plugin = {
    div: HTMLDivElement;
};

export type PluginMaker = (plugin_helper: PluginHelper) => Plugin;

type ZulipEventListener = (event: ZulipEvent) => void;

type KeyboardHandler = (key: string) => boolean;

export class PluginHelper {
    div: HTMLDivElement;
    deleted: boolean;
    page: Page;
    open: boolean;
    label: string;
    tab_button: TabButton;
    plugin: Plugin;
    zulip_event_listener?: ZulipEventListener;
    keyboard_handler?: KeyboardHandler;

    constructor(plugin_maker: PluginMaker, page: Page) {
        const div = document.createElement("div");
        div.style.height = "100%";
        div.style.overflow = "hidden";
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

    set_zulip_event_listener(listener: ZulipEventListener): void {
        if (this.zulip_event_listener) {
            console.error("We only support one listener at a time.");
        }
        this.zulip_event_listener = listener;
    }

    handle_zulip_event(event: ZulipEvent) {
        if (this.zulip_event_listener) {
            this.zulip_event_listener(event);
        }
    }

    set_keyboard_handler(handler: KeyboardHandler): void {
        this.keyboard_handler = handler;
    }

    dispatch_keyboard_shortcut(key: string): boolean {
        return this.keyboard_handler?.(key) ?? false;
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
