// See main.ts for the main entry point.

import type { Address } from "./address";
import type { Page } from "./page";
import type { PluginFactory } from "./plugin_helper";
import type { ReadingList } from "./plugins/reading_list";

class Application {
    page: Page;
    reading_list: ReadingList | undefined;

    constructor(page: Page) {
        this.page = page;
        this.reading_list = undefined;
    }

    add_navigator(address: Address) {
        this.page!.add_navigator(address);
    }

    add_plugin(factory: PluginFactory) {
        this.page!.add_plugin(factory);
    }

    is_plugin_active(factory: PluginFactory): boolean {
        return this.page!.is_plugin_active(factory);
    }

    set_reading_list(reading_list: ReadingList): void {
        this.reading_list = reading_list;
    }

    add_address_link_to_reading_list(address: Address): void {
        this.reading_list?.add_address_link_item(address);
    }

    is_topic_in_reading_list(topic_id: number): boolean {
        return this.reading_list?.is_topic_in_list(topic_id) ?? false;
    }

    dispatch_keyboard_shortcut(key: string): boolean {
        return this.page.dispatch_keyboard_shortcut(key);
    }
}

export let APP: Application;

export function init(page: Page) {
    APP = new Application(page);
}
