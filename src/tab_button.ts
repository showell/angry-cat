import * as colors from "./colors";
import * as tab_button_widget from "./dom/tab_button_widget";

const all_tab_buttons: TabButton[] = [];

function find_tab_button_at(x: number, y: number): TabButton | undefined {
    const elem = document.elementFromPoint(x, y);
    if (!elem) return undefined;
    return all_tab_buttons.find(
        (tb) => tb.div === elem || tb.div.contains(elem),
    );
}

export class TabButton {
    tab_button: HTMLElement;
    div: HTMLDivElement;
    on_reorder: ((source: TabButton, target: TabButton) => void) | undefined;

    constructor(on_click: () => void) {
        const div = document.createElement("div");
        const tab_button = tab_button_widget.tab_button();
        div.style.touchAction = "none";

        let suppress_click = false;

        tab_button.addEventListener("click", (e) => {
            if (suppress_click) {
                e.preventDefault();
                e.stopPropagation();
                suppress_click = false;
                return;
            }
            on_click();
        });

        div.addEventListener("pointerdown", (e) => {
            const start_x = e.clientX;
            let dragging = false;

            const on_move = (me: PointerEvent) => {
                if (!dragging && Math.abs(me.clientX - start_x) > 5) {
                    dragging = true;
                    div.style.opacity = "0.4";
                }
            };

            const on_up = (ue: PointerEvent) => {
                document.removeEventListener("pointermove", on_move);
                document.removeEventListener("pointerup", on_up);
                div.style.opacity = "1";

                if (dragging) {
                    suppress_click = true;
                    const target = find_tab_button_at(ue.clientX, ue.clientY);
                    if (target && target !== this) {
                        this.on_reorder?.(this, target);
                    }
                }
            };

            document.addEventListener("pointermove", on_move);
            document.addEventListener("pointerup", on_up);
        });

        div.append(tab_button);

        this.div = div;
        this.tab_button = tab_button;
        all_tab_buttons.push(this);
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
