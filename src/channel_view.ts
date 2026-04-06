import { AddTopicPane } from "./add_topic_pane";
import type { Message } from "./backend/db_types";
import * as model from "./backend/model";
import { ChannelInfo } from "./channel_info";
import type { ChannelRow } from "./channel_row";

import * as layout from "./layout";
import type { MessageList } from "./message_list";
import { MessageView } from "./message_view";
import type { Navigator } from "./navigator";
import type { PaneManager } from "./pane_manager";
import { TopicList } from "./topic_list";
import type { TopicRow } from "./topic_row";

export class ChannelView {
    channel_row: ChannelRow;
    channel_info: ChannelInfo;
    topic_list: TopicList;
    message_view?: MessageView;
    add_topic_pane?: AddTopicPane;
    pane_manager: PaneManager;

    constructor(
        channel_row: ChannelRow,
        navigator: Navigator,
        pane_manager: PaneManager,
    ) {
        this.channel_row = channel_row;
        this.pane_manager = pane_manager;

        this.add_topic_pane = undefined;

        const topic_pane_div = document.createElement("div");

        // TopicList will immediately populate itself.
        const topic_list = new TopicList(channel_row, navigator);

        const heading_text = "#" + channel_row.name();
        const adjuster_div = topic_list.get_adjuster_div();
        layout.draw_table_pane(
            topic_pane_div,
            heading_text,
            adjuster_div,
            topic_list.div,
        );

        pane_manager.add_pane({
            key: "topic_pane",
            pane_widget: { div: topic_pane_div },
        });

        const channel_info = new ChannelInfo(channel_row);
        pane_manager.add_pane({
            key: "channel_info",
            pane_widget: channel_info,
        });

        this.topic_list = topic_list;
        this.channel_info = channel_info;
    }

    open_message_view(): void {
        const pane_manager = this.pane_manager;
        const topic_row = this.get_topic_row()!;

        pane_manager.remove_after("topic_pane");

        this.message_view = new MessageView(topic_row, pane_manager);

        if (this.add_topic_pane) {
            pane_manager.add_pane({
                key: "add_topic_pane",
                pane_widget: this.add_topic_pane,
            });
        }

        const message_list = this.get_message_list()!;
        message_list.focus();
    }

    get_topic_list(): TopicList {
        return this.topic_list;
    }

    get_topic_row(): TopicRow | undefined {
        const topic_list = this.topic_list;
        return topic_list.get_topic_row()!;
    }

    refresh(message: Message): void {
        if (message.stream_id !== this.channel_row.stream_id()) {
            return;
        }

        const sent_by_me = model.is_me(message.sender_id);

        /*
         * In the add-topic scenario, we don't switch to the
         * new topic until the message event gets confirmed
         * by the server. If the server lags a bit, we risk
         * having the user intentionally change topic views
         * in between, but this is not the end of the world.
         *
         * We try to guess as best as we can. To be more
         * rigorous, we may eventually try to use queue_id
         * and local_id (see https://zulip.com/api/send-message)
         * to reconcile messages.
         */

        const can_change_topic = sent_by_me && this.add_topic_pane;

        if (
            can_change_topic &&
            !this.topic_list.is_selected_topic(message.topic_id)
        ) {
            this.select_topic_and_append(message);
            return;
        }

        this.topic_list.refresh();

        if (
            this.message_view &&
            this.topic_list.is_selected_topic(message.topic_id)
        ) {
            this.get_message_list()!.append_message(message);
        }
    }

    current_unread_count(): number {
        const topic_row = this.topic_list.get_topic_row();
        if (topic_row) {
            return topic_row.unread_count();
        }
        return this.channel_row.unread_count();
    }

    get_message_view(): MessageView | undefined {
        return this.message_view;
    }

    get_message_list(): MessageList | undefined {
        if (this.message_view === undefined) {
            return undefined;
        }
        return this.message_view.get_message_list();
    }

    select_topic_and_append(message: Message): void {
        const topic_list = this.topic_list;

        topic_list.refresh_topics_with_topic_selected(message.topic_id);
        this.open_message_view();
    }

    clear_message_view(): void {
        const pane_manager = this.pane_manager;
        const topic_list = this.topic_list;

        topic_list.clear_selection();

        pane_manager.replace_after("topic_pane", {
            key: "channel_info",
            pane_widget: this.channel_info,
        });

        this.add_topic_pane = undefined;
    }

    handle_stream_update(
        stream_id: number,
        rendered_description: string,
    ): void {
        if (stream_id === this.channel_row.stream_id()) {
            this.channel_info.handle_stream_update(rendered_description);
        }
    }

    add_topic(): void {
        const pane_manager = this.pane_manager;
        const topic_list = this.topic_list;

        topic_list.clear_selection();

        const add_topic_pane = new AddTopicPane(this.channel_row);

        pane_manager.replace_after("topic_pane", {
            key: "add_topic_pane",
            pane_widget: add_topic_pane,
        });

        add_topic_pane.focus_compose_box();

        this.add_topic_pane = add_topic_pane;
    }

    select_topic_id(topic_id: number): void {
        const topic_list = this.topic_list;
        topic_list.select_topic_id(topic_id);
        this.add_topic_pane = undefined;
        this.open_message_view();
    }
}
