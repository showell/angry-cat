import type { ZulipEvent } from "./backend/event";
import type { Message } from "./backend/db_types";

import { EventFlavor } from "./backend/event";

import type { Address } from "./address";
import type { ChannelChooser } from "./channel_chooser/types";
import type { MessageList } from "./message_list";
import type { MessageView } from "./message_view";
import type { PluginHelper } from "./plugin_helper";
import type { ChannelRow, TopicRow } from "./row_types";
import type { TopicList } from "./topic_list";

import * as layout from "./layout";

import { APP } from "./app";
import { make_channel_chooser } from "./channel_chooser/channel_chooser";
import { ButtonPanel } from "./nav_button_panel";
import { ChannelView } from "./channel_view";
import { PaneManager } from "./pane_manager";
import { StatusBar } from "./status_bar";

function narrow_label(
    channel_name: string | undefined,
    topic_name: string | undefined,
    unread_count: number,
): string {
    let label: string;

    if (topic_name !== undefined) {
        label = "> " + topic_name;
    } else if (channel_name !== undefined) {
        label = "#" + channel_name;
    } else {
        label = "Channels";
    }

    const prefix = unread_count === 0 ? "" : `(${unread_count}) `;

    return prefix + label;
}

export function plugin_maker_for_address(start_address: Address) {
    function maker(plugin_helper: PluginHelper) {
        return new SearchWidget(plugin_helper, start_address);
    }

    return maker;
}

export class SearchWidget {
    div: HTMLDivElement;
    button_panel: ButtonPanel;
    pane_manager: PaneManager;
    channel_id: number | undefined;
    channel_chooser: ChannelChooser;
    channel_view?: ChannelView;
    plugin_helper: PluginHelper;
    start_address: Address;

    constructor(plugin_helper: PluginHelper, start_address: Address) {
        const self = this;

        this.plugin_helper = plugin_helper;
        this.start_address = start_address;
        this.channel_id = start_address.channel_id;

        const div = document.createElement("div");

        const button_panel = new ButtonPanel(self);
        const pane_manager = new PaneManager();

        const channel_chooser = make_channel_chooser({
            start_channel_id: start_address.channel_id,
            handle_channel_chosen(channel_id: number | undefined) {
                self.channel_id = channel_id;
                self.update_channel();
            },
            handle_channel_cleared() {
                self.channel_id = undefined;
                self.clear_channel();
            },
        });

        pane_manager.add_pane({
            key: "channel_chooser",
            pane_widget: { div: channel_chooser.div },
        });

        layout.draw_search_widget(div, button_panel.div, pane_manager.div);

        this.button_panel = button_panel;
        this.channel_chooser = channel_chooser;
        this.pane_manager = pane_manager;
        this.div = div;

        if (start_address.topic_id) {
            if (start_address.channel_id === undefined) {
                throw new Error("unexpected");
            }
            this.update_channel();
            this.channel_view!.select_topic_id(start_address.topic_id);
            this.update_topic();

            if (start_address.message_id) {
                const message_list = this.get_message_list()!;
                message_list.go_to_message_id(start_address.message_id);
            }

            return;
        }

        if (start_address.channel_id) {
            this.update_channel();
            return;
        }

        this.update_button_panel();
        StatusBar.inform("Begin finding messages by clicking on a channel.");
        this.update_label();
    }

    fork(): void {
        const channel_id = this.channel_id;
        const topic_id = this.get_topic_id();
        const message_id = undefined; // for now
        const address = { channel_id, topic_id, message_id };
        APP.add_plugin(plugin_maker_for_address(address));
    }

    refresh_message_ids(message_ids: number[]): void {
        this.channel_chooser.refresh_completely();

        const topic_list = this.get_topic_list();
        const message_list = this.get_message_list();

        if (topic_list) {
            topic_list.refresh();
        }

        if (message_list) {
            message_list.refresh_message_ids(message_ids);
        }
    }

    handle_incoming_message(message: Message): void {
        this.channel_chooser.refresh_completely();
        if (this.channel_view) {
            this.channel_view.refresh(message);
        }
    }

    get_topic_list(): TopicList | undefined {
        if (this.channel_view === undefined) {
            return undefined;
        }
        return this.channel_view.get_topic_list();
    }

    get_topic_row(): TopicRow | undefined {
        const topic_list = this.get_topic_list();

        if (topic_list === undefined) {
            return undefined;
        }

        return topic_list.get_topic_row();
    }

    get_topic_name(): string | undefined {
        const topic_row = this.get_topic_row();
        return topic_row?.name();
    }

    get_message_list(): MessageList | undefined {
        if (this.channel_view === undefined) {
            return undefined;
        }
        return this.channel_view.get_message_list();
    }

    topic_selected(): boolean {
        const topic_list = this.get_topic_list();
        if (topic_list === undefined) {
            return false;
        }
        return topic_list.has_selection();
    }

    channel_selected(): boolean {
        return this.channel_id !== undefined;
    }

    build_main_section(): HTMLElement {
        const div = document.createElement("div");
        div.style.display = "flex";
        return div;
    }

    update_button_panel(): void {
        this.button_panel.update({
            channel_selected: this.channel_selected(),
            topic_selected: this.topic_selected(),
        });
    }

    get_channel_row(): ChannelRow {
        return this.channel_chooser.get_channel_row()!;
    }

    get_channel_name(): string | undefined {
        const channel_row = this.get_channel_row();

        return channel_row?.name();
    }

    get_topic_id(): number | undefined {
        return this.get_topic_list()?.get_topic_id();
    }

    unread_count(): number {
        const topic_row = this.get_topic_row();

        if (topic_row) {
            return topic_row.unread_count();
        }

        const channel_row = this.get_channel_row();

        if (channel_row) {
            return channel_row.unread_count();
        }

        return this.channel_chooser.total_unread_count();
    }

    get_narrow_label(): string {
        const channel_name = this.get_channel_name();
        const topic_name = this.get_topic_name();
        const unread_count = this.unread_count();

        return narrow_label(channel_name, topic_name, unread_count);
    }

    update_label(): void {
        this.plugin_helper!.update_label(this.get_narrow_label());
    }

    clear_channel(): void {
        this.pane_manager.remove_after("channel_chooser");
        this.channel_view = undefined;
        this.update_button_panel();
        this.update_label();
        StatusBar.inform("You can choose a channel now.");
    }

    update_channel(): void {
        const search_widget = this;
        const pane_manager = this.pane_manager;
        const channel_row = this.get_channel_row();

        this.pane_manager.remove_after("channel_chooser");

        // ChannelView will add panes
        this.channel_view = new ChannelView(
            channel_row,
            search_widget,
            pane_manager,
        );

        this.update_button_panel();
        StatusBar.inform("You can click on a topic now.");
        this.update_label();
    }

    add_topic(): void {
        if (!this.channel_view) {
            console.log("Add topic without a channel?");
            return;
        }
        this.channel_view.add_topic();
    }

    mark_topic_read(): void {
        const message_list = this.get_message_list();

        if (!message_list) {
            console.log("unexpected lack of message_list");
            return;
        }
        message_list.mark_topic_read();
    }

    update_topic(): void {
        StatusBar.inform("You can read or reply now.");
        this.update_button_panel();
        this.update_label();
    }

    set_topic_id(topic_id: number): void {
        this.channel_view!.select_topic_id(topic_id);
        this.update_topic();
    }

    clear_message_view(): void {
        this.channel_view!.clear_message_view();
        this.update_button_panel();
        this.update_label();
    }

    get_message_view(): MessageView | undefined {
        if (this.channel_view) {
            return this.channel_view.get_message_view();
        }

        return undefined;
    }

    reply(): void {
        const message_view = this.get_message_view();
        if (message_view) {
            message_view.reply();
        }
    }

    close(): void {
        this.plugin_helper!.delete_me();
    }

    handle_event(event: ZulipEvent): void {
        if (event.flavor === EventFlavor.MESSAGE) {
            this.handle_incoming_message(event.message);
        }

        if (event.flavor === EventFlavor.MUTATE_MESSAGE_ADDRESS) {
            this.refresh_message_ids(event.message_ids);
        }

        if (event.flavor === EventFlavor.MUTATE_MESSAGE_CONTENT) {
            this.refresh_message_ids([event.message_id]);
        }

        if (event.flavor === EventFlavor.MUTATE_UNREAD) {
            this.refresh_message_ids(event.message_ids);
        }

        this.update_label();
    }
}
