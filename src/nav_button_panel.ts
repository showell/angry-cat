import { Button } from "./button";
import type { SearchWidget } from "./search_widget";

export class ButtonPanel {
    div: HTMLDivElement;
    close: Button;
    fork: Button;
    add_topic: Button;
    mark_topic_read: Button;
    reply: Button;

    constructor(search_widget: SearchWidget) {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.maxHeight = "fit-content";
        div.style.marginTop = "11px";
        div.style.marginBottom = "14px";

        this.close = new Button("close", 60, () => {
            search_widget.close();
        });

        this.close.button.style.color = "white";
        this.close.button.style.backgroundColor = "red";

        this.fork = new Button("fork", 60, () => {
            search_widget.fork();
            this.fork.set_normal_color();
        });

        this.add_topic = new Button("Add topic", 150, () => {
            search_widget.add_topic();
        });

        this.mark_topic_read = new Button("Mark topic read", 150, () => {
            search_widget.mark_topic_read();
        });

        this.reply = new Button("Reply", 150, () => {
            search_widget.reply();
        });

        div.append(this.close.div);
        div.append(this.fork.div);

        div.append(this.add_topic.div);

        div.append(this.mark_topic_read.div);
        div.append(this.reply.div);

        this.div = div;
    }

    update(info: {
        channel_selected: boolean;
        topic_selected: boolean;
        has_unreads: boolean;
    }): void {
        const { channel_selected, topic_selected, has_unreads } = info;

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
        show_if(this.reply, topic_selected);
    }
}
