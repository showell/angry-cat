import { APP } from "./app";
import { Button } from "./button";
import type { Navigator } from "./navigator";
import { StatusBar } from "./status_bar";

export class ButtonPanel {
    div: HTMLDivElement;
    close: Button;
    fork: Button;
    add_topic: Button;
    mark_topic_read: Button;
    mark_topic_unread: Button;
    read_later: Button;
    reply: Button;

    constructor(navigator: Navigator) {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.maxHeight = "fit-content";
        div.style.marginTop = "11px";
        div.style.marginBottom = "14px";

        this.close = new Button("close", 60, () => {
            navigator.close();
        });

        this.close.button.style.color = "white";
        this.close.button.style.backgroundColor = "red";

        this.fork = new Button("fork", 60, () => {
            navigator.fork();
            this.fork.set_normal_color();
        });

        this.add_topic = new Button("Add topic", 150, () => {
            navigator.add_topic();
        });

        this.mark_topic_read = new Button("Mark topic read", 150, () => {
            navigator.mark_topic_read();
        });

        this.mark_topic_unread = new Button("Mark topic unread", 165, () => {
            navigator.mark_topic_unread();
        });

        this.read_later = new Button("Read later", 120, () => {
            const channel_id = navigator.channel_id;
            const topic_id = navigator.get_topic_id();
            const topic_name = navigator.get_topic_name();
            APP.add_address_link_to_reading_list({
                channel_id,
                topic_id,
                message_id: undefined,
            });
            this.read_later.hide();
            StatusBar.celebrate(
                `Topic "${topic_name}" was added to your reading list!`,
            );
        });

        this.reply = new Button("Reply", 150, () => {
            navigator.reply();
        });

        div.append(this.close.div);
        div.append(this.fork.div);

        div.append(this.add_topic.div);

        div.append(this.mark_topic_read.div);
        div.append(this.mark_topic_unread.div);
        div.append(this.read_later.div);
        div.append(this.reply.div);

        this.div = div;
    }

    update(info: {
        channel_selected: boolean;
        topic_selected: boolean;
        has_unreads: boolean;
        show_read_later: boolean;
        show_mark_unread: boolean;
    }): void {
        const { channel_selected, topic_selected, has_unreads, show_read_later, show_mark_unread } = info;

        function show_if(button: Button, cond: boolean): void {
            if (cond) {
                button.show();
            } else {
                button.hide();
            }
        }

        show_if(this.close, true);
        show_if(this.fork, true);

        show_if(this.add_topic, channel_selected);

        show_if(this.mark_topic_read, has_unreads);
        show_if(this.mark_topic_unread, show_mark_unread);
        show_if(this.read_later, show_read_later);
        show_if(this.reply, topic_selected);
    }
}
