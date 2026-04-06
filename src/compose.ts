import * as zulip_client from "./backend/zulip_client";
import { Button } from "./button";
import * as compose_widget from "./dom/compose_widget";
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

    async upload_file(file: File): Promise<void> {
        this.insert_text(`[${file.name}]` + "(");
        const url = await zulip_client.upload_file(file);
        this.insert_text(url + ")");
    }

    add_paste_handler(): void {
        const elem = this.elem;

        elem.addEventListener("paste", (event) => {
            const clipboard_data = event.clipboardData;
            if (!clipboard_data) {
                return;
            }

            const files = Array.from(clipboard_data.files);

            // Only load the first for now.
            const file = files[0];

            if (!file) {
                // Do normal paste behavior.
                return;
            }

            this.upload_file(file);
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

    disable(): void {
        this.elem.disabled = true;
    }

    enable(): void {
        this.elem.disabled = false;
    }
}

export class ComposeBox {
    div: HTMLElement;
    topic_input: TopicInput;
    textarea: TextArea;
    send_button: Button;
    stream_id: number;

    constructor(stream_id: number, topic_name: string) {
        this.stream_id = stream_id;

        const div = document.createElement("div");

        const topic_input = new TopicInput(topic_name);
        const textarea = new TextArea();
        const { button_row_div, send_button } = this.build_button_row();

        div.append(topic_input.div);
        div.append(textarea.div);
        div.append(button_row_div);

        document.body.append(div);

        this.topic_input = topic_input;
        this.div = div;
        this.textarea = textarea;
        this.send_button = send_button;
    }

    has_text(): boolean {
        return this.textarea.contents().trim() !== "";
    }

    blur_textarea(): void {
        this.textarea.elem.blur();
    }

    focus_textarea(): void {
        this.textarea.focus();
    }

    build_button_row(): { button_row_div: HTMLElement; send_button: Button } {
        const button_row_div = compose_widget.button_row_div();

        const file_input = document.createElement("input");
        file_input.type = "file";
        file_input.style.display = "none";
        file_input.addEventListener("change", () => {
            const file = file_input.files?.[0];
            if (file) {
                this.textarea.upload_file(file);
                file_input.value = "";
            }
        });
        button_row_div.append(file_input);

        const upload_button = new Button("Upload", 100, () => {
            file_input.click();
        });

        const send_button = new Button("Send", 100, () => {
            const content = this.get_content_to_send();
            this.textarea.clear();
            this.disable();
            StatusBar.inform("Sending…");
            this.send(content);
        });

        button_row_div.append(send_button.div);
        button_row_div.append(upload_button.div);

        return { button_row_div, send_button };
    }

    disable(): void {
        this.textarea.disable();
        this.send_button.disable();
    }

    enable(): void {
        this.textarea.enable();
        this.send_button.enable();
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
                this.enable();
                this.textarea.focus();
            },
            (error_msg) => {
                this.enable();
                StatusBar.scold(`Failed to send: ${error_msg}`);
                this.textarea.insert_text(content);
            },
        );
    }

    focus_topic_input(): void {
        this.topic_input.focus();
    }
}
