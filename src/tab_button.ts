import * as colors from "./colors";
import * as tab_button_widget from "./dom/tab_button_widget";

export class TabButton {
    tab_button: HTMLElement;
    div: HTMLDivElement;

    constructor(on_click: () => void) {
        const div = document.createElement("div");
        const tab_button = tab_button_widget.tab_button();

        tab_button.addEventListener("click", on_click);
        div.append(tab_button);

        this.div = div;
        this.tab_button = tab_button;
    }

    refresh(label: string, open: boolean, highlighted: boolean): void {
        const tab_button = this.tab_button;

        tab_button.innerText = label;

        if (highlighted) {
            tab_button.style.backgroundColor = colors.new_message_border;
            tab_button.style.borderBottom = `1px ${colors.border} solid`;
            tab_button.style.color = colors.primary;
        } else if (open) {
            tab_button.style.backgroundColor = colors.surface;
            tab_button.style.borderBottom = `1px ${colors.surface} solid`;
            tab_button.style.color = colors.primary;
        } else {
            tab_button.style.backgroundColor = colors.tab_inactive_bg;
            tab_button.style.borderBottom = `1px ${colors.border} solid`;
            tab_button.style.color = colors.primary;
        }
    }
}
