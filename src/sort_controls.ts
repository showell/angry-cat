import * as batch_count from "./batch_count";
import { Button } from "./button";
import { SortCycle } from "./grouping_sort";
import * as sort_prefs from "./sort_prefs";

export class SortControls {
    div: HTMLDivElement;
    topic_sort: SortCycle;
    batch_size: number;
    on_change: () => void;
    pane_key: string;

    constructor(info: {
        initial_max: number;
        on_change: () => void;
        count_label: string;
        pane_key: string;
    }) {
        this.pane_key = info.pane_key;
        this.topic_sort = new SortCycle(info.count_label, sort_prefs.get(info.pane_key));
        this.batch_size = 10;
        this.on_change = info.on_change;

        this.div = document.createElement("div");
        this.div.style.display = "flex";
        this.div.style.alignItems = "center";
        this.div.style.gap = "8px";

        this.repopulate(info.initial_max);
    }

    repopulate(max_topics: number): void {
        const div = this.div;
        div.innerHTML = "";

        const toggle_button = new Button("Toggle Sort", 100, () => {
            this.topic_sort.toggle();
            sort_prefs.set(this.pane_key, this.topic_sort.mode);
            this.on_change();
        });
        div.append(toggle_button.div);

        const sort_label = document.createElement("div");
        sort_label.innerText = this.topic_sort.label();
        div.append(sort_label);

        if (this.topic_sort.mode === "alpha") {
            const slider = batch_count.adjuster({
                min: 1,
                max: max_topics,
                value: this.batch_size,
                callback: (batch_size: number) => {
                    this.batch_size = batch_size;
                    this.on_change();
                },
            });
            div.append(slider);
        }
    }
}
