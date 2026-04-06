import type { Address } from "./address";
import * as address from "./address";
import { DB } from "./backend/database";
import type { ZulipEvent } from "./backend/event";
import { EventFlavor } from "./backend/event";
import * as model from "./backend/model";
import { get_current_realm_nickname } from "./backend/config";
import * as page_widget from "./dom/page_widget";
import * as layout from "./layout";
import * as dm from "./dm/plugin";
import * as lyn_rummy from "./lyn_rummy/plugin";
import * as activity from "./plugins/activity";
import { MessageRow } from "./backend/message_row";
import * as navigator from "./navigator";
import type { Plugin, PluginContext, PluginFactory } from "./plugin_helper";
import * as plugin_chooser from "./plugins/plugin_chooser";
import * as reading_list from "./plugins/reading_list";
import * as recent_conversations from "./plugins/recent_conversations";
import { create_global_status_bar, StatusBar } from "./status_bar";
import { TabButton } from "./tab_button";

type PluginEntry = {
    plugin: Plugin;
    label: string;
    open: boolean;
    deleted: boolean;
    highlighted: boolean;
    container_div: HTMLDivElement;
    tab_button: TabButton;
};

export class Page {
    div: HTMLDivElement;
    plugin_entries: PluginEntry[];
    container_div: HTMLDivElement;
    button_bar_div: HTMLDivElement;

    constructor() {
        const div = document.createElement("div");
        document.body.style.margin = "0";
        document.body.append(div);

        div.style.marginLeft = "8px";
        create_global_status_bar();

        div.append(StatusBar.div);
        StatusBar.inform(
            "Welcome to Zulip! loading users and recent messages...",
        );

        this.button_bar_div = document.createElement("div");
        this.container_div = document.createElement("div");

        this.plugin_entries = [];
        this.div = div;
    }

    start(): void {
        this.populate();
        this.add_plugin(plugin_chooser.plugin);
        this.add_plugin(lyn_rummy.plugin);
        this.add_plugin(recent_conversations.plugin);
        this.add_plugin(reading_list.plugin);
        this.add_plugin(activity.plugin);
        this.add_plugin(dm.plugin);
        this.add_navigator(address.nada());
        this.update_title();
    }

    update_title(): void {
        const unread_count = model.get_total_unread_count();
        const prefix = unread_count === 0 ? "" : `(${unread_count}) `;
        document.title = `${prefix}${get_current_realm_nickname()}`;
    }

    add_plugin(factory: PluginFactory): void {
        const container_div = document.createElement("div");
        container_div.style.height = "100%";
        container_div.style.overflow = "hidden";
        container_div.style.display = "none";

        const tab_button = new TabButton(() => {
            this.make_plugin_active(entry);
        });

        const entry: PluginEntry = {
            plugin: undefined!,
            label: "plugin",
            open: false,
            deleted: false,
            highlighted: false,
            container_div,
            tab_button,
        };

        const context: PluginContext = {
            update_label: (label) => {
                entry.label = label;
                tab_button.refresh(label, entry.open, entry.highlighted);
            },
            request_close: () => this.close_plugin(entry),
            highlight_tab: () => {
                entry.highlighted = true;
                tab_button.refresh(entry.label, entry.open, entry.highlighted);
            },
            reset_tab_highlight: () => {
                entry.highlighted = false;
                tab_button.refresh(entry.label, entry.open, entry.highlighted);
            },
            tab_count: () =>
                this.plugin_entries.filter(
                    (e) => !e.deleted && e.plugin.is_navigator,
                ).length,
        };

        tab_button.refresh(entry.label, entry.open, entry.highlighted);

        const plugin = factory(context);
        entry.plugin = plugin;
        container_div.append(plugin.div);

        this.plugin_entries.push(entry);
        this.make_plugin_active(entry);
        this.container_div.append(container_div);
        this.populate_button_bar();
    }

    close_all(): void {
        for (const entry of this.plugin_entries) {
            if (entry.open) {
                entry.open = false;
                entry.container_div.style.display = "none";
                entry.tab_button.refresh(
                    entry.label,
                    entry.open,
                    entry.highlighted,
                );
            }
        }
    }

    make_plugin_active(entry: PluginEntry): void {
        this.close_all();
        entry.open = true;
        entry.container_div.style.display = "block";
        entry.tab_button.refresh(entry.label, entry.open, entry.highlighted);
    }

    activate_last_plugin(): void {
        this.compact_deleted_plugins();
        const entries = this.plugin_entries;
        this.make_plugin_active(entries[entries.length - 1]);
    }

    close_plugin(entry: PluginEntry): void {
        entry.container_div.remove();
        entry.deleted = true;
        this.activate_last_plugin();
        this.populate_button_bar();
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

    compact_deleted_plugins(): void {
        this.plugin_entries = this.plugin_entries.filter(
            (entry) => !entry.deleted,
        );
    }

    populate_button_bar(): void {
        const self = this;

        this.compact_deleted_plugins();

        const tab_button_divs = this.plugin_entries.map(
            (entry) => entry.tab_button.div,
        );

        function add_navigator(): void {
            self.add_navigator(address.nada());
        }

        const button_bar = page_widget.make_button_bar(
            tab_button_divs,
            add_navigator,
        );

        this.button_bar_div.innerHTML = "";
        this.button_bar_div.append(button_bar);
    }

    add_navigator(address: Address): void {
        this.add_plugin(navigator.plugin_maker_for_address(address));
    }

    dispatch_keyboard_shortcut(key: string): boolean {
        const active = this.plugin_entries.find((e) => e.open);
        return active?.plugin.handle_keyboard_shortcut?.(key) ?? false;
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

        for (const entry of this.plugin_entries) {
            entry.plugin.handle_zulip_event?.(event);
        }

        this.update_title();
    }
}
