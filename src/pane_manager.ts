type PaneWidget = {
    div: HTMLElement;
};

type Pane = {
    key: string;
    pane_widget: PaneWidget;
};

export class PaneManager {
    div: HTMLDivElement;
    panes: Pane[];

    constructor() {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.flex = "1";
        div.style.minHeight = "0";
        div.style.overflowX = "auto";

        this.div = div;
        this.panes = [];
    }

    add_pane(pane: Pane): void {
        const div = this.div;

        if (this.end_key_matches(pane.key)) {
            console.log("already added", pane.key);
            return;
        }

        this.panes.push(pane);
        div.append(pane.pane_widget.div);
    }

    pop(key: string) {
        if (!this.end_key_matches(key)) {
            console.log("mismatch key", key);
            return;
        }
        this.panes[this.panes.length - 1].pane_widget.div.remove();
        this.panes = this.panes.slice(0, this.panes.length - 1);
    }

    remove_after(key: string) {
        const new_panes = [];

        let remove = false;

        for (const pane of this.panes) {
            if (remove) {
                pane.pane_widget.div.remove();
            } else {
                new_panes.push(pane);
                if (pane.key === key) {
                    remove = true;
                }
            }
        }

        this.panes = new_panes;
    }

    replace_after(key: string, new_pane: Pane) {
        this.remove_after(key);
        this.add_pane(new_pane);
    }

    end_key_matches(key: string): boolean {
        const panes = this.panes;
        const size = panes.length;

        if (size === 0) {
            return false;
        }

        return key === panes[size - 1].key;
    }
}
