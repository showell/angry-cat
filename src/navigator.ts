// Navigator is the main pane for browsing channels, topics, and messages.
// It is created by Page (via APP.add_navigator) when the app starts and
// whenever the user opens a new navigation tab. Recent Conversations and
// message links in the Reading List also open Navigator tabs via APP.add_navigator.

import type { Address } from "./address";
import { AddressType, address_type } from "./address";
import { APP } from "./app";
import type { Message } from "./backend/db_types";
import type { ZulipEvent } from "./backend/event";
import { EventFlavor } from "./backend/event";
import { make_channel_chooser } from "./channel_chooser/channel_chooser";
import type { ChannelChooser } from "./channel_chooser/types";
import type { ChannelRow } from "./channel_row";
import { ChannelView } from "./channel_view";
import * as layout from "./layout";
import type { MessageList } from "./message_list";
import type { MessageView } from "./message_view";
import { ButtonPanel } from "./nav_button_panel";
import { PaneManager } from "./pane_manager";
import { handle_arrow_down, handle_arrow_up } from "./arrow_keys";
import type { ArrowKeyContext } from "./arrow_keys";
import { handle_enter_key } from "./enter_key";
import type { EnterKeyContext } from "./enter_key";
import { handle_esc_key } from "./esc_key";
import type { EscKeyContext } from "./esc_key";
import { handle_n_key, NextTopicResult } from "./n_key";
import type { NKeyContext } from "./n_key";
import type { Plugin, PluginContext, PluginFactory } from "./plugin_helper";
import { StatusBar } from "./status_bar";
import type { TopicList } from "./topic_list";

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

export function plugin_maker_for_address(start_address: Address): PluginFactory {
    return function (context: PluginContext): Plugin {
        const nav = new Navigator(context, start_address);
        return {
            div: nav.div,
            handle_zulip_event: (event) => nav.handle_zulip_event(event),
            handle_keyboard_shortcut: (key) => nav.handle_keyboard_shortcut(key),
            is_navigator: true,
        };
    };
}

export class Navigator
    implements NKeyContext, EscKeyContext, ArrowKeyContext, EnterKeyContext
{
    div: HTMLDivElement;
    button_panel: ButtonPanel;
    pane_manager: PaneManager;
    channel_id: number | undefined;
    channel_chooser: ChannelChooser;
    channel_view?: ChannelView;
    context: PluginContext;
    start_address: Address;

    constructor(context: PluginContext, start_address: Address) {
        const self = this;

        this.context = context;
        this.start_address = start_address;
        this.channel_id = start_address.channel_id;

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.flexDirection = "column";
        div.style.height = "100%";

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

        layout.draw_navigator(div, button_panel.div, pane_manager.div);

        this.button_panel = button_panel;
        this.channel_chooser = channel_chooser;
        this.pane_manager = pane_manager;
        this.div = div;

        this.navigate_to_start_address();
    }

    private navigate_to_start_address(): void {
        const start_address = this.start_address;

        switch (address_type(start_address)) {
            case AddressType.NADA: {
                this.update_button_panel();
                this.update_label();
                StatusBar.inform(
                    "Begin finding messages by clicking on a channel.",
                );
                return;
            }

            case AddressType.CHANNEL: {
                this.update_channel();
                return;
            }

            case AddressType.TOPIC:
            case AddressType.MESSAGE: {
                if (start_address.channel_id === undefined) {
                    throw new Error("unexpected");
                }

                const channel_row = this.get_channel_row();
                console.log("channel_row", channel_row);

                // ChannelView will add panes
                this.channel_view = new ChannelView(
                    channel_row,
                    this,
                    this.pane_manager,
                );

                this.channel_view!.select_topic_id(start_address.topic_id!);

                if (start_address.message_id) {
                    const message_list = this.get_message_list()!;
                    message_list.go_to_message_id(start_address.message_id);
                    StatusBar.inform("You can read or reply now.");
                } else {
                    StatusBar.inform("You can click on a topic now.");
                }

                this.update_button_panel();
                this.update_label();

                return;
            }
        }
    }

    // --- Actions ---

    handle_keyboard_shortcut(key: string): boolean {
        if (key === "r") {
            // TODO: if the add-topic pane is open, this silently no-ops
            // because get_message_view() returns undefined. Consider whether
            // "r" should close add-topic and open reply instead.
            this.reply();
            return true;
        }
        if (key === "n") {
            return handle_n_key(this);
        }
        if (key === "ArrowDown") {
            return handle_arrow_down(this);
        }
        if (key === "ArrowUp") {
            return handle_arrow_up(this);
        }
        if (key === "Enter") {
            return handle_enter_key(this);
        }
        if (key === "Escape") {
            return handle_esc_key(this);
        }
        return false;
    }

    fork(): void {
        const channel_id = this.channel_id;
        const topic_id = this.get_topic_id();
        const message_id = undefined; // for now
        const address = { channel_id, topic_id, message_id };
        APP.add_plugin(plugin_maker_for_address(address));
    }

    go_to_next_topic(): NextTopicResult {
        const topic_id = this.get_topic_id();
        if (topic_id === undefined) return NextTopicResult.CLEARED;
        const topic_list = this.get_topic_list();
        if (topic_list === undefined) return NextTopicResult.CLEARED;
        const next_id = topic_list.get_next_unread_topic_id(topic_id);
        if (next_id !== undefined) {
            this.set_topic_id(next_id);
            return NextTopicResult.ADVANCED;
        } else {
            this.clear_message_view();
            return NextTopicResult.CLEARED;
        }
    }

    read_later(): void {
        const channel_id = this.channel_id;
        const topic_id = this.get_topic_id();
        const topic_name = this.get_topic_name();
        APP.add_address_link_to_reading_list({
            channel_id,
            topic_id,
            message_id: undefined,
        });
        StatusBar.celebrate(
            `Topic "${topic_name}" was added to your reading list!`,
        );
        this.update_button_panel();
    }

    // --- Event handling ---

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

    // --- State ---

    get_topic_list(): TopicList | undefined {
        if (this.channel_view === undefined) {
            return undefined;
        }
        return this.channel_view.get_topic_list();
    }

    get_topic_name(): string | undefined {
        return this.channel_view?.get_topic_name();
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

    get_first_channel_id(): number | undefined {
        return this.channel_chooser.get_first_channel_id();
    }

    get_next_channel_id(): number | undefined {
        if (this.channel_id === undefined) return undefined;
        return this.channel_chooser.get_adjacent_channel_id(this.channel_id, 1);
    }

    get_prev_channel_id(): number | undefined {
        if (this.channel_id === undefined) return undefined;
        return this.channel_chooser.get_adjacent_channel_id(
            this.channel_id,
            -1,
        );
    }

    get_first_unread_channel_id(): number | undefined {
        return this.channel_chooser.get_first_unread_channel_id();
    }

    select_channel(channel_id: number): void {
        this.channel_chooser.select_channel(channel_id);
    }

    get_first_unread_topic_id(): number | undefined {
        return this.get_topic_list()?.get_next_unread_topic_id(undefined);
    }

    get_first_topic_id(): number | undefined {
        return this.get_topic_list()?.get_first_topic_id();
    }

    get_next_topic_id(): number | undefined {
        const topic_id = this.get_topic_id();
        if (topic_id === undefined) return undefined;
        return this.get_topic_list()?.get_adjacent_topic_id(topic_id, 1);
    }

    get_prev_topic_id(): number | undefined {
        const topic_id = this.get_topic_id();
        if (topic_id === undefined) return undefined;
        return this.get_topic_list()?.get_adjacent_topic_id(topic_id, -1);
    }

    // --- EscKeyContext ---

    is_composing(): boolean {
        const reply_pane = this.get_message_view()?.reply_pane;
        if (reply_pane?.is_textarea_focused() && reply_pane.has_text()) {
            return true;
        }
        const add_topic_pane = this.channel_view?.add_topic_pane;
        if (add_topic_pane?.is_textarea_focused() && add_topic_pane.has_text()) {
            return true;
        }
        return false;
    }

    blur_compose(): void {
        const reply_pane = this.get_message_view()?.reply_pane;
        if (reply_pane?.is_textarea_focused()) {
            reply_pane.blur();
            return;
        }
        this.channel_view?.add_topic_pane?.blur();
    }

    reply_pane_open(): boolean {
        return this.get_message_view()?.reply_pane !== undefined;
    }

    close_reply_pane(): void {
        this.get_message_view()?.close_reply_pane();
    }

    add_topic_pane_open(): boolean {
        return this.channel_view?.add_topic_pane !== undefined;
    }

    close_add_topic_pane(): void {
        this.channel_view?.close_add_topic_pane();
    }

    close_channel(): void {
        this.channel_chooser.deselect();
    }

    tab_count(): number {
        return this.context.tab_count();
    }

    close_tab(): void {
        this.context.request_close();
    }

    // --- EnterKeyContext ---

    focus_message_list(): void {
        this.get_message_list()?.focus();
    }

    // --- Updates ---

    update_button_panel(): void {
        const topic_selected = this.topic_selected();
        const topic_id = this.get_topic_id();
        const has_unreads = topic_selected && this.unread_count() > 0;
        const already_listed =
            topic_id !== undefined && APP.is_topic_in_reading_list(topic_id);
        this.button_panel.update({
            channel_selected: this.channel_selected(),
            topic_selected,
            has_unreads,
            show_read_later: topic_selected && !already_listed,
            show_mark_unread: topic_selected && !has_unreads,
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
        return this.channel_view?.get_topic_id();
    }

    unread_count(): number {
        if (this.channel_view) {
            return this.channel_view.current_unread_count();
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
        this.context.update_label(this.get_narrow_label());
    }

    clear_channel(): void {
        this.pane_manager.remove_after("channel_chooser");
        this.channel_view = undefined;
        this.update_button_panel();
        this.update_label();
        StatusBar.inform("You can choose a channel now.");
    }

    update_channel(): void {
        const pane_manager = this.pane_manager;
        const channel_row = this.get_channel_row();

        this.pane_manager.remove_after("channel_chooser");

        // ChannelView will add panes
        this.channel_view = new ChannelView(channel_row, this, pane_manager);

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

    mark_topic_unread(): void {
        const message_list = this.get_message_list();

        if (!message_list) {
            console.log("unexpected lack of message_list");
            return;
        }
        message_list.mark_last_message_unread();
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
        this.context.request_close();
    }

    handle_zulip_event(event: ZulipEvent): void {
        switch (event.flavor) {
            case EventFlavor.MESSAGE:
                this.handle_incoming_message(event.message);
                break;
            case EventFlavor.MUTATE_MESSAGE_ADDRESS:
                this.refresh_message_ids(event.message_ids);
                break;
            case EventFlavor.MUTATE_MESSAGE_CONTENT:
                this.refresh_message_ids([event.message_id]);
                break;
            case EventFlavor.MUTATE_UNREAD:
                this.refresh_message_ids(event.message_ids);
                break;
            case EventFlavor.REACTION_ADD_EVENT:
            case EventFlavor.REACTION_REMOVE_EVENT:
                this.refresh_message_ids([event.message_id]);
                break;
            case EventFlavor.MUTATE_STREAM:
                this.channel_view?.handle_stream_update(
                    event.stream_id,
                    event.rendered_description,
                );
                break;
        }

        this.update_button_panel();
        this.update_label();
    }
}
