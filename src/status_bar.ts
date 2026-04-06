import { Button } from "./button";
import * as colors from "./colors";
import * as popup from "./popup";

export let StatusBar: StatusBarWidget;

function show_help(): void {
    const div = document.createElement("div");
    div.style.padding = "8px";
    div.style.maxWidth = "500px";
    div.style.maxHeight = "60vh";
    div.style.overflow = "auto";

    div.innerHTML = `
<h2 style="color: ${colors.primary}; margin-top: 0;">Angry Cat Help</h2>

<h3>Getting started</h3>
<p>Use the <b>arrow keys</b> to browse channels. Press <b>Enter</b> to
drill into a channel's topics, then use arrows to browse topics.
Press <b>Enter</b> again to focus the message list for scrolling.</p>

<h3>Reading messages</h3>
<p>Once a topic is selected, its messages appear in a scrollable pane.
Use <b>arrow keys</b> or the mouse wheel to scroll through them.</p>

<h3>Replying</h3>
<p>Press <b>r</b> to open the reply compose box. Type your message and
click Send (or press Tab then Enter). Press <b>Escape</b> to close
the compose box.</p>

<h3>Keyboard shortcuts</h3>
<table style="border-collapse: collapse;">
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">n</td>
    <td>Jump to next unread topic (marks current as read)</td></tr>
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">r</td>
    <td>Reply to the current topic</td></tr>
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">p</td>
    <td>Open the plugin launcher</td></tr>
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">Enter</td>
    <td>Drill into channel → topics → message list</td></tr>
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">Escape</td>
    <td>Back out one level at a time</td></tr>
<tr><td style="padding: 2px 12px 2px 0; font-weight: bold;">↑ / ↓</td>
    <td>Navigate channels or topics</td></tr>
</table>

<h3>Tabs</h3>
<p>Press <b>p</b> to launch plugins like Activity, Buddies, DMs, and more.
Use <b>Escape</b> to close any tab. Drag tabs to reorder them.
Click <b>+</b> to open a new navigator tab.</p>
`;

    popup.pop({ div, confirm_button_text: "Close", callback: () => {} });
}

const DISPLAY_MS = 10_000;
const FADE_MS = 3_000;

class StatusBarWidget {
    div: HTMLDivElement;
    text_div: HTMLElement;
    private fade_timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        this.div = document.createElement("div");
        this.div.style.display = "flex";
        this.div.style.alignItems = "center";
        this.div.style.gap = "8px";

        this.text_div = this.make_text_div();
        this.div.append(this.text_div);

        const help_button = new Button("Help", 60, show_help);
        this.div.append(help_button.div);
    }

    make_text_div() {
        const text_div = document.createElement("div");
        text_div.style.fontSize = "17px";
        text_div.style.flex = "1";
        text_div.style.transition = `opacity ${FADE_MS}ms ease`;
        return text_div;
    }

    private show(text: string, color: string): void {
        this.text_div.style.color = color;
        this.text_div.innerText = text;
        this.text_div.style.opacity = "1";

        if (this.fade_timer !== undefined) {
            clearTimeout(this.fade_timer);
        }
        this.fade_timer = setTimeout(() => {
            this.text_div.style.opacity = "0";
            this.fade_timer = undefined;
        }, DISPLAY_MS);
    }

    scold(text: string) {
        this.show(text, colors.danger);
    }

    celebrate(text: string) {
        this.show(text, colors.success);
    }

    inform(text: string) {
        this.show(text, colors.status_info);
    }

    clear(): void {
        this.text_div.innerText = "";
    }
}

export function create_global_status_bar(): void {
    StatusBar = new StatusBarWidget();
}
