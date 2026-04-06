import type { Address } from "./address";
import * as address from "./address";
import { DB } from "./backend/database";
import type { ZulipEvent } from "./backend/event";
import { EventFlavor } from "./backend/event";
import * as model from "./backend/model";
import { get_current_realm_nickname } from "./backend/config";
import * as page_widget from "./dom/page_widget";
import * as layout from "./layout";
import * as lyn_rummy from "./lyn_rummy/plugin";
import { MessageRow } from "./backend/message_row";
import * as navigator from "./navigator";
import { handle_p_key } from "./p_key";
import type { Plugin, PluginContext, PluginFactory } from "./plugin_helper";
import * as popup from "./popup";
import * as recent_conversations from "./plugins/recent_conversations";
import { show_help } from "./status_bar";
import { create_global_status_bar, StatusBar } from "./status_bar";
import { TabButton } from "./tab_button";

type PluginEntry = {
    plugin: Plugin;
    factory: PluginFactory;
    label: string;
    highlighted: boolean;
    container_div: HTMLDivElement;
    tab_button: TabButton;
};

export class Page {
    div: HTMLDivElement;
    entries: PluginEntry[];
    active_entry: PluginEntry | undefined;
    container_div: HTMLDivElement;
    button_bar_div: HTMLDivElement;

    constructor() {
        const div = document.createElement("div");
        document.body.style.margin = "0";
        document.body.append(div);

        div.style.marginLeft = "8px";
        create_global_status_bar();

        div.append(StatusBar.div);

        this.button_bar_div = document.createElement("div");
        this.container_div = document.createElement("div");

        this.entries = [];
        this.active_entry = undefined;
        this.div = div;
    }

    start(): void {
        this.populate();
        this.add_plugin(lyn_rummy.plugin);
        this.add_plugin(recent_conversations.plugin);
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
            this.make_active(entry);
        });

        tab_button.on_reorder = (source, target) => {
            this.handle_tab_reorder(source, target);
        };

        const entry: PluginEntry = {
            plugin: undefined!,
            factory,
            label: "plugin",
            highlighted: false,
            container_div,
            tab_button,
        };

        const context: PluginContext = {
            update_label: (label) => {
                entry.label = label;
                this.refresh_tab_button(entry);
            },
            request_close: () => this.close_plugin(entry),
            highlight_tab: () => {
                entry.highlighted = true;
                this.refresh_tab_button(entry);
            },
            reset_tab_highlight: () => {
                entry.highlighted = false;
                this.refresh_tab_button(entry);
            },
            tab_count: () =>
                this.entries.filter((e) => e.plugin.is_navigator).length,
        };

        const plugin = factory(context);
        entry.plugin = plugin;
        container_div.append(plugin.div);

        this.entries.push(entry);
        this.make_active(entry);
        this.container_div.append(container_div);
        this.rebuild_button_bar();
    }

    private refresh_tab_button(entry: PluginEntry): void {
        const is_active = entry === this.active_entry;
        entry.tab_button.refresh(entry.label, is_active, entry.highlighted);
    }

    private deactivate_all(): void {
        for (const entry of this.entries) {
            entry.container_div.style.display = "none";
        }
        this.active_entry = undefined;
    }

    make_active(entry: PluginEntry): void {
        this.deactivate_all();
        this.active_entry = entry;
        entry.container_div.style.display = "block";
        this.refresh_all_tab_buttons();
    }

    private refresh_all_tab_buttons(): void {
        for (const entry of this.entries) {
            this.refresh_tab_button(entry);
        }
    }

    close_plugin(entry: PluginEntry): void {
        const index = this.entries.indexOf(entry);
        if (index === -1) return;

        entry.container_div.remove();
        this.entries.splice(index, 1);

        if (this.active_entry === entry) {
            const new_index = Math.min(index, this.entries.length - 1);
            this.make_active(this.entries[new_index]);
        }

        this.rebuild_button_bar();
    }

    populate(): void {
        this.rebuild_button_bar();
        const navbar_div = layout.make_navbar(
            StatusBar.div,
            this.button_bar_div,
        );
        layout.draw_page(this.div, navbar_div, this.container_div);
    }

    private handle_tab_reorder(
        source: TabButton,
        target: TabButton | "end",
    ): void {
        const source_entry = this.entries.find(
            (e) => e.tab_button === source,
        );
        if (!source_entry) return;

        const source_index = this.entries.indexOf(source_entry);
        this.entries.splice(source_index, 1);

        if (target === "end") {
            this.entries.push(source_entry);
        } else {
            const target_entry = this.entries.find(
                (e) => e.tab_button === target,
            );
            if (!target_entry) return;
            const target_index = this.entries.indexOf(target_entry);
            this.entries.splice(target_index, 0, source_entry);
        }

        this.rebuild_button_bar();
    }

    rebuild_button_bar(): void {
        const tab_button_divs = this.entries.map(
            (entry) => entry.tab_button.div,
        );

        const button_bar = page_widget.make_button_bar(
            tab_button_divs,
            () => this.add_navigator(address.nada()),
        );

        this.button_bar_div.innerHTML = "";
        this.button_bar_div.append(button_bar);
    }

    add_navigator(addr: Address): void {
        this.add_plugin(navigator.plugin_maker_for_address(addr));
    }

    is_plugin_active(factory: PluginFactory): boolean {
        return this.entries.some((e) => e.factory === factory);
    }

    dispatch_keyboard_shortcut(key: string): boolean {
        if (key === "p") {
            return handle_p_key();
        }
        if (key === "h" || key === "?") {
            show_help();
            return true;
        }
        const active = this.active_entry;
        if (!active) return false;
        const handled = active.plugin.handle_keyboard_shortcut?.(key) ?? false;
        if (handled) return true;
        if (key === "Escape") {
            this.show_close_tab_popup(active);
            return true;
        }
        return false;
    }

    private show_close_tab_popup(entry: PluginEntry): void {
        const div = document.createElement("div");
        div.style.padding = "8px 4px";

        const is_sole_navigator =
            entry.plugin.is_navigator &&
            this.entries.filter((e) => e.plugin.is_navigator).length <= 1;

        if (is_sole_navigator) {
            div.innerText =
                "This is your only navigator tab, so we'll keep it open for you.";
            popup.pop({ div, confirm_button_text: "OK", callback: () => {} });
        } else {
            div.innerText = "Close this tab?";
            popup.pop({
                div,
                confirm_button_text: "Close",
                cancel_button_text: "Cancel",
                callback: () => this.close_plugin(entry),
            });
        }
    }

    handle_zulip_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MESSAGE) {
            const message_row = new MessageRow(event.message);
            const sender_name = message_row.sender_name();
            const addr = message_row.address_string();
            StatusBar.inform(
                `Message arrived from ${sender_name} at ${addr}.`,
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
            const addr = message_row.address_string();
            StatusBar.inform(
                `A message was edited by ${sender_name} on ${addr}.`,
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

        for (const entry of this.entries) {
            entry.plugin.handle_zulip_event?.(event);
        }

        this.update_title();
    }
}
