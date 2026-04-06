import type { MessageList } from "./message_list";
import { MessagePane } from "./message_pane";
import type { PaneManager } from "./pane_manager";
import { ReplyPane } from "./reply_pane";
import type { TopicRow } from "./topic_row";

export class MessageView {
    message_pane: MessagePane;
    topic_row: TopicRow;
    reply_pane?: ReplyPane;
    pane_manager: PaneManager;

    constructor(topic_row: TopicRow, pane_manager: PaneManager) {
        const message_pane = new MessagePane(topic_row);

        pane_manager.add_pane({
            key: "message_pane",
            pane_widget: message_pane,
        });

        this.topic_row = topic_row;
        this.message_pane = message_pane;
        this.pane_manager = pane_manager;
    }

    reply(): void {
        const pane_manager = this.pane_manager;
        const topic_row = this.topic_row;

        if (!this.reply_pane) {
            const reply_pane = new ReplyPane(topic_row);
            pane_manager.add_pane({
                key: "reply_pane",
                pane_widget: reply_pane,
            });
            this.reply_pane = reply_pane;
        }

        this.reply_pane.focus();
    }

    handle_escape(): boolean {
        const reply_pane = this.reply_pane;
        if (!reply_pane) return false;
        if (reply_pane.has_text()) {
            reply_pane.blur();
            return true;
        }
        this.pane_manager.remove_after("message_pane");
        this.reply_pane = undefined;
        return true;
    }

    get_message_list(): MessageList {
        return this.message_pane.get_message_list();
    }
}
