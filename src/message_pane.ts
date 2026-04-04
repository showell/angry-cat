import type { Filter } from "./backend/filter";

import type { TopicRow } from "./row_types";

import * as model from "./backend/model";

import * as layout from "./layout";
import { MessageList } from "./message_list";
import { MessageViewHeader } from "./message_view_header";

export class MessagePane {
    div: HTMLDivElement;
    message_list: MessageList;

    constructor(topic_row: TopicRow) {
        const div = document.createElement("div");

        const topic_line = new MessageViewHeader(topic_row);
        const topic_id = topic_row.topic_id();

        const messages = model.messages_for_topic(topic_id);

        const filter: Filter = {
            predicate(message) {
                return message.topic_id === topic_id;
            },
        };

        const max_width = 500;

        const message_list = new MessageList({
            messages,
            filter,
            max_width,
            topic_id,
        });

        layout.draw_list_pane(div, topic_line.div, message_list.div);

        this.div = div;
        this.message_list = message_list;
    }

    get_message_list(): MessageList {
        return this.message_list;
    }
}
