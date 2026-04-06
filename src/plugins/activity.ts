import * as action_log from "../action_log";
import type { ActionEntry } from "../action_log";
import * as colors from "../colors";
import * as table_widget from "../dom/table_widget";
import type { Plugin, PluginContext } from "../plugin_helper";

function format_time(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function render_text_cell(text: string): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = text;
    return div;
}

function render_location_cell(entry: ActionEntry): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = `#${entry.channel_name} > ${entry.topic_name}`;
    div.style.color = colors.primary;
    return div;
}

function build_table(entries: readonly ActionEntry[]): HTMLElement {
    const reversed = [...entries].reverse();

    const rows = reversed.map((entry) => {
        const divs = [
            render_text_cell(format_time(entry.timestamp)),
            render_text_cell(entry.action),
            render_location_cell(entry),
        ];
        return { divs };
    });

    return table_widget.table(["Time", "Action", "Location"], rows);
}

function build_empty_message(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = "No actions recorded yet. Browse some topics!";
    div.style.color = colors.text_muted;
    div.style.padding = "20px";
    return div;
}

export function plugin(context: PluginContext): Plugin {
    context.update_label("Activity");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxHeight = "90vh";
    div.style.overflow = "auto";

    function refresh(): void {
        div.innerHTML = "";
        const entries = action_log.get_entries();
        if (entries.length === 0) {
            div.append(build_empty_message());
        } else {
            div.append(build_table(entries));
        }
    }

    action_log.on_change(refresh);
    refresh();

    return { div };
}
