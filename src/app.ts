// See main.ts for the main entry point.

import type { Address } from "./address";
import type { Page } from "./page";
import type { PluginMaker } from "./plugin_helper";
import type { TodoList } from "./todo_list";

class Application {
    page: Page;
    reading_list_todo: TodoList | undefined;

    constructor(page: Page) {
        this.page = page;
        this.reading_list_todo = undefined;
    }

    add_navigator(address: Address) {
        this.page!.add_navigator(address);
    }

    add_plugin(plugin_maker: PluginMaker) {
        this.page!.add_plugin(plugin_maker);
    }

    set_reading_list(todo_list: TodoList): void {
        this.reading_list_todo = todo_list;
    }

    add_address_link_to_reading_list(address: Address): void {
        this.reading_list_todo?.add_address_link_item(address);
    }

    is_topic_in_reading_list(topic_id: number): boolean {
        return this.reading_list_todo?.is_topic_in_list(topic_id) ?? false;
    }
}

export let APP: Application;

export function init(page: Page) {
    APP = new Application(page);
}
