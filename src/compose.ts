import * as zulip_client from "./backend/zulip_client";

import * as compose_widget from "./dom/compose_widget";

import { Button } from "./button";
import { StatusBar } from "./status_bar";

class TopicInput {
    div: HTMLElement;
    topic_input: HTMLInputElement;

    constructor(topic_name: string) {
        const div = document.createElement("div");

        const topic_input = compose_widget.topic_input(topic_name);
        const label = compose_widget.labeled_input("Topic: >", topic_input);

        div.append(label);

        this.topic_input = topic_input;
        this.div = div;
    }

    focus(): void {
        StatusBar.inform("Try to choose a descriptive but short topic.");
        this.topic_input.focus();
    }

    topic_name(): string {
        return this.topic_input.value;
    }
}

class TextArea {
    div: HTMLElement;
    elem: HTMLTextAreaElement;

    constructor() {
        const div = document.createElement("div");

        const elem = compose_widget.render_textarea();
        div.append(elem);

        this.div = div;
        this.elem = elem;

        this.add_paste_handler();
    }

    add_paste_handler(): void {
        const self = this;
        const elem = this.elem;

        elem.addEventListener("paste", (event) => {
            const clipboard_data = event.clipboardData;
            if (!clipboard_data) {
                return;
            }

            const files = Array.from(clipboard_data.files);

            // Only load the first for now.
            const file = files[0];
            async function add_upload_link() {
                self.insert_text(`[${file.name}]` + "(");
                const url = await zulip_client.upload_file(file);
                self.insert_text(url + ")");
            }

            add_upload_link();
        });
    }

    insert_text(text: string): void {
        const textarea = this.elem;

        textarea.setRangeText(
            text,
            textarea.selectionStart,
            textarea.selectionEnd,
            "end",
        );
        textarea.focus();
    }

    contents(): string {
        return this.elem.value;
    }

    clear(): void {
        this.elem.value = "";
    }

    focus(): void {
        StatusBar.inform("You can hit tab to get to the Send button.");
        this.elem.focus();
    }
}

export class ComposeBox {
    div: HTMLElement;
    topic_input: TopicInput;
    textarea: TextArea;
    stream_id: number;

    constructor(stream_id: number, topic_name: string) {
        const self = this;
        this.stream_id = stream_id;

        const div = document.createElement("div");

        const topic_input = new TopicInput(topic_name);

        const textarea = new TextArea();

        div.append(topic_input.div);
        div.append(textarea.div);
        div.append(self.button_row());

        document.body.append(div);

        this.topic_input = topic_input;
        this.div = div;
        this.textarea = textarea;
    }

    focus_textarea(): void {
        this.textarea.focus();
    }

    button_row(): HTMLElement {
        const self = this;

        const div = compose_widget.button_row_div();

        const send_button = new Button("Send", 100, () => {
            // TODO: save draft
            const content = self.get_content_to_send();
            this.textarea.clear();
            this.textarea.focus();
            self.send(content);
        });

        div.append(send_button.div);

        return div;
    }

    get_content_to_send(): string {
        return this.textarea.contents();
    }

    send(content: string): void {
        const channel_id = this.stream_id;
        const topic_name = this.topic_input.topic_name();

        zulip_client.send_message(
            { channel_id, topic_name, content },
            (_message) => {
                console.log(
                    `the sent message from ${topic_name} came as event`,
                );
            },
        );
    }

    focus_topic_input(): void {
        this.topic_input.focus();
    }
}
