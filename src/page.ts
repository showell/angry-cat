import type { ZulipEvent } from "./backend/event";
import type { PluginMaker } from "./plugin_helper";

import type { Address } from "./address";

import { DB } from "./backend/database";
import { EventFlavor } from "./backend/event";
import * as model from "./backend/model";

import * as page_widget from "./dom/page_widget";

import * as lyn_rummy from "./lyn_rummy/plugin";
import * as plugin_chooser from "./plugins/plugin_chooser";
import { PluginHelper } from "./plugin_helper";

import * as address from "./address";
import * as layout from "./layout";
import { MessageRow } from "./row_types";
import * as search_widget from "./search_widget";
import { StatusBar, create_global_status_bar } from "./status_bar";
import { get_current_realm_nickname } from "./config";

export class Page {
    div: HTMLDivElement;
    plugin_helpers: PluginHelper[];
    container_div: HTMLDivElement;
    button_bar_div: HTMLDivElement;

    constructor() {
        const div = document.createElement("div");
        document.body.append(div);

        div.style.margin = "0";
        div.style.marginLeft = "8px";
        create_global_status_bar();

        div.append(StatusBar.div);
        StatusBar.inform(
            "Welcome to Zulip! loading users and recent messages...",
        );

        this.button_bar_div = document.createElement("div");
        this.container_div = document.createElement("div");

        this.plugin_helpers = [];
        this.div = div;
    }

    start(): void {
        this.populate();
        this.add_plugin(plugin_chooser.plugin);
        this.add_plugin(lyn_rummy.plugin);
        this.add_search_widget(address.nada());
        this.update_title();
    }

    update_title(): void {
        const unread_count = model.get_total_unread_count();
        const prefix = unread_count === 0 ? "" : `(${unread_count}) `;
        document.title = `${prefix}${get_current_realm_nickname()}`;
    }

    add_plugin(plugin_maker: PluginMaker): void {
        const page = this;
        const plugin_helpers = this.plugin_helpers;

        const plugin_helper = new PluginHelper(plugin_maker, page);
        plugin_helpers.push(plugin_helper);

        this.make_plugin_active(plugin_helper);
        this.container_div.append(plugin_helper.div);
        this.populate_button_bar();
    }

    close_all(): void {
        for (const plugin_helper of this.plugin_helpers) {
            if (plugin_helper.open) {
                plugin_helper.open = false;
                plugin_helper.div.style.display = "none";
                plugin_helper.redraw_tab_button();
            }
        }
    }

    make_plugin_active(plugin_helper: PluginHelper): void {
        this.close_all();
        plugin_helper.open = true;
        plugin_helper.div.style.display = "block";
        plugin_helper.redraw_tab_button();
    }

    activate_last_plugin(): void {
        this.compact_deleted_plugins();
        const plugin_helpers = this.plugin_helpers;
        this.make_plugin_active(plugin_helpers[plugin_helpers.length - 1]);
    }

    populate(): void {
        const div = this.div;
        const container_div = this.container_div;

        this.populate_button_bar();
        const navbar_div = layout.make_navbar(
            StatusBar.div,
            this.button_bar_div,
        );

        layout.draw_page(div, navbar_div, container_div);
    }

    compact_deleted_plugins() {
        this.plugin_helpers = this.plugin_helpers.filter(
            (plugin_helper) => !plugin_helper.deleted,
        );
    }

    populate_button_bar() {
        const self = this;

        this.compact_deleted_plugins();

        const plugin_helpers = this.plugin_helpers;

        const tab_button_divs = plugin_helpers.map((plugin_helper) => {
            return plugin_helper.tab_button.div;
        });

        function add_search_widget(): void {
            self.add_search_widget(address.nada());
        }

        const button_bar = page_widget.make_button_bar(
            tab_button_divs,
            add_search_widget,
        );

        this.button_bar_div.innerHTML = "";
        this.button_bar_div.append(button_bar);
    }

    add_search_widget(address: Address): void {
        this.add_plugin(search_widget.plugin_maker_for_address(address));
    }

    handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MESSAGE) {
            const message_row = new MessageRow(event.message);
            const sender_name = message_row.sender_name();
            const address = message_row.address_string();
            StatusBar.inform(
                `Message arrived from ${sender_name} at ${address}.`,
            );
        }

        if (event.flavor === EventFlavor.MUTATE_MESSAGE_ADDRESS) {
            // We eventually need to be more specific here.
            StatusBar.scold(
                `${event.message_ids.length} messages have been moved!`,
            );
        }

        if (event.flavor === EventFlavor.MUTATE_MESSAGE_CONTENT) {
            const message = DB.message_map.get(event.message_id)!;
            const message_row = new MessageRow(message);
            const sender_name = message_row.sender_name();
            const address = message_row.address_string();
            StatusBar.inform(
                `A message was edited by ${sender_name} on ${address}.`,
            );
        }

        if (event.flavor === EventFlavor.MUTATE_UNREAD) {
            const val = event.unread ? "unread" : "read";
            StatusBar.celebrate(`Messages have been marked as ${val}.`);
        }

        if (event.flavor === EventFlavor.REACTION_ADD_EVENT) {
            const sender_id = event.user_id;
            const message = DB.message_map.get(event.message_id);
            if (sender_id === DB.current_user_id) {
                StatusBar.celebrate(`Your reaction was posted!`);
            } else if (message?.sender_id === DB.current_user_id) {
                const reactor_name = DB.user_map.get(sender_id)?.full_name;
                StatusBar.celebrate(`${reactor_name} reacted to your message!`);
            }
        }

        for (const plugin_helper of this.plugin_helpers) {
            plugin_helper.handle_zulip_event(event);
        }

        this.update_title();
    }
}
