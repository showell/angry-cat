import * as colors from "./colors";
import * as tab_button_widget from "./dom/tab_button_widget";

const all_tab_buttons: TabButton[] = [];

const MOVE_TO_END = Symbol("move_to_end");

function find_drop_target(
    x: number,
    y: number,
): TabButton | typeof MOVE_TO_END | undefined {
    const elem = document.elementFromPoint(x, y);
    if (elem) {
        const tab = all_tab_buttons.find(
            (tb) => tb.div === elem || tb.div.contains(elem),
        );
        if (tab) return tab;
    }
    const last = all_tab_buttons[all_tab_buttons.length - 1];
    if (last) {
        const rect = last.div.getBoundingClientRect();
        if (x > rect.right && Math.abs(y - rect.top) < rect.height * 2) {
            return MOVE_TO_END;
        }
    }
    return undefined;
}

export class TabButton {
    tab_button: HTMLElement;
    div: HTMLDivElement;
    on_reorder:
        | ((source: TabButton, target: TabButton | "end") => void)
        | undefined;

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
            let ghost: HTMLElement | undefined;

            const on_move = (me: PointerEvent) => {
                if (!dragging && Math.abs(me.clientX - start_x) > 5) {
                    dragging = true;
                    div.style.opacity = "0.4";
                    ghost = div.cloneNode(true) as HTMLElement;
                    ghost.style.position = "fixed";
                    ghost.style.opacity = "0.8";
                    ghost.style.pointerEvents = "none";
                    ghost.style.zIndex = "9999";
                    ghost.style.top = `${div.getBoundingClientRect().top}px`;
                    ghost.style.left = `${me.clientX}px`;
                    document.body.append(ghost);
                }
                if (ghost) {
                    ghost.style.left = `${me.clientX}px`;
                }
            };

            const on_up = (ue: PointerEvent) => {
                document.removeEventListener("pointermove", on_move);
                document.removeEventListener("pointerup", on_up);
                div.style.opacity = "1";
                ghost?.remove();

                if (dragging) {
                    suppress_click = true;
                    const target = find_drop_target(ue.clientX, ue.clientY);
                    if (target === MOVE_TO_END) {
                        this.on_reorder?.(this, "end");
                    } else if (target && target !== this) {
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
