// Reading List — a persistent, reorderable list of items (text notes
// or links to channels/topics/messages). Persisted to localStorage.

import type { Address, DumpedAddress } from "../address";
import { dump_address, load_address } from "../address";
import { APP } from "../app";
import { DB, is_starred, label_for_address } from "../backend/database";
import { MessageRow } from "../backend/message_row";
import { Button } from "../button";
import * as colors from "../colors";
import * as local_storage from "../localstorage";
import type { Plugin, PluginContext } from "../plugin_helper";
import { StatusBar } from "../status_bar";

// --- Item types ---

export type ItemData =
    | { kind: "text"; text: string }
    | { kind: "address_link"; address: Address };

type InternalItem = {
    id: number;
    done: boolean;
    data: ItemData;
};

let next_id = 1;

const STORAGE_KEY = "reading_list";

// Serialization helpers. Address links are stored using dump_address
// (channel_id + message_id) so they survive session restarts where
// topic_ids change. On load, we recover topic_id from the message.

type DumpedItemData =
    | { kind: "text"; text: string }
    | { kind: "address_link"; address: DumpedAddress };

function dump_item_data(data: ItemData): DumpedItemData {
    if (data.kind === "text") return data;
    return { kind: "address_link", address: dump_address(data.address) };
}

function load_item_data(data: DumpedItemData): ItemData {
    if (data.kind === "text") return data;
    // load_address recovers topic_id from the message cache. If the
    // message isn't in our cache, topic_id will be undefined — the
    // item is kept but marked as a broken link at click time.
    const address = load_address(data.address);
    return { kind: "address_link", address };
}

// --- Pure rendering helpers ---

function render_drag_handle(): HTMLSpanElement {
    const handle = document.createElement("span");
    handle.innerText = "☰";
    handle.style.cursor = "grab";
    handle.style.opacity = "0.4";
    handle.style.fontSize = "20px";
    handle.style.userSelect = "none";
    return handle;
}

function render_done_button(
    done: boolean,
    on_click: () => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerText = done ? "✓" : "○";
    button.style.minWidth = "32px";
    button.style.fontSize = "18px";
    button.style.padding = "2px 6px";
    button.addEventListener("click", on_click);
    return button;
}

function apply_done_style(elem: HTMLElement, done: boolean): void {
    elem.style.flex = "1";
    elem.style.fontSize = "18px";
    if (done) {
        elem.style.textDecoration = "line-through";
        elem.style.opacity = "0.5";
    }
}

function render_remove_button(on_click: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerText = "✕";
    button.style.opacity = "0.5";
    button.style.fontSize = "16px";
    button.style.padding = "2px 6px";
    button.addEventListener("click", on_click);
    return button;
}

function can_navigate(address: Address): boolean {
    // We need at least a channel to navigate. If a message_id was
    // stored but we couldn't recover the topic, the link is broken.
    if (address.channel_id === undefined) return false;
    if (address.message_id !== undefined && address.topic_id === undefined) {
        return false;
    }
    return true;
}

function render_item_content(data: ItemData): HTMLElement {
    if (data.kind === "text") {
        const span = document.createElement("span");
        span.innerText = data.text;
        return span;
    }

    const address = data.address;
    const label = label_for_address(address);
    const broken = !can_navigate(address);

    const button = document.createElement("button");
    button.innerText = broken ? `${label} (not in cache)` : label;
    button.style.color = broken ? colors.text_muted : colors.primary;
    button.style.fontWeight = "bold";
    button.style.background = "none";
    button.style.border = "none";
    button.style.cursor = "pointer";
    button.style.padding = "0";
    button.style.textAlign = "left";
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (broken) {
            StatusBar.scold(
                "This message is not in the current cache. Try again after a full reload.",
            );
        } else {
            APP.add_navigator(address);
        }
    });
    return button;
}

// --- ReadingList class ---

export class ReadingList {
    div: HTMLDivElement;
    private items: InternalItem[];
    private drag_id: number | undefined;
    private drop_index: number | undefined;

    constructor() {
        this.items = this.load();
        this.drag_id = undefined;
        this.drop_index = undefined;
        this.div = document.createElement("div");
        this.div.style.display = "flex";
        this.div.style.flexDirection = "column";
        this.div.style.gap = "4px";
        this.div.style.minWidth = "300px";
        this.div.style.margin = "40px";
        this.render();
    }

    // Persistence uses dump_address/load_address so that topic_ids
    // (which are session-local) are replaced with message_ids that
    // survive across page reloads.

    private save(): void {
        const data = this.items.map((item) => ({
            done: item.done,
            data: dump_item_data(item.data),
        }));
        local_storage.set(STORAGE_KEY, { items: data });
    }

    private load(): InternalItem[] {
        const raw = local_storage.get(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.items)) return [];
        return parsed.items.map(
            (entry: { done: boolean; data: DumpedItemData }) => ({
                id: next_id++,
                done: entry.done,
                data: load_item_data(entry.data),
            }),
        );
    }

    add_text_item(text: string): void {
        this.items.push({
            id: next_id++,
            done: false,
            data: { kind: "text", text },
        });
        this.save();
        this.render();
    }

    add_address_link_item(address: Address): void {
        this.items.push({
            id: next_id++,
            done: false,
            data: { kind: "address_link", address },
        });
        this.save();
        this.render();
    }

    item_count(): number {
        return this.items.length;
    }

    is_topic_in_list(topic_id: number): boolean {
        return this.items.some(
            (item) =>
                item.data.kind === "address_link" &&
                item.data.address.topic_id === topic_id,
        );
    }

    private remove_item(id: number): void {
        this.items = this.items.filter((item) => item.id !== id);
        this.save();
        this.render();
    }

    private toggle_done(id: number): void {
        const item = this.items.find((item) => item.id === id);
        if (item) {
            item.done = !item.done;
            this.save();
            this.render();
        }
    }

    private move_item(from_id: number, to_index: number): void {
        const from_index = this.items.findIndex((item) => item.id === from_id);
        if (from_index === -1) return;
        const [item] = this.items.splice(from_index, 1);
        this.items.splice(to_index, 0, item);
        this.save();
    }

    // Uses pointer events (not mouse events) so drag works on
    // touchscreens and trackpads. A ghost follows the pointer
    // vertically during the drag for visual feedback.
    private wire_drag(handle: HTMLElement, row: HTMLElement, item_id: number): void {
        handle.style.touchAction = "none";

        handle.addEventListener("pointerdown", (e: PointerEvent) => {
            const start_y = e.clientY;
            let dragging = false;
            let ghost: HTMLElement | undefined;

            const on_move = (me: PointerEvent) => {
                if (!dragging && Math.abs(me.clientY - start_y) > 5) {
                    dragging = true;
                    this.drag_id = item_id;
                    this.drop_index = this.items.findIndex(
                        (i) => i.id === item_id,
                    );
                    row.style.opacity = "0.4";

                    ghost = row.cloneNode(true) as HTMLElement;
                    ghost.style.position = "fixed";
                    ghost.style.opacity = "0.8";
                    ghost.style.pointerEvents = "none";
                    ghost.style.zIndex = "9999";
                    ghost.style.left = `${row.getBoundingClientRect().left}px`;
                    ghost.style.width = `${row.getBoundingClientRect().width}px`;
                    ghost.style.top = `${me.clientY}px`;
                    document.body.append(ghost);
                }
                if (dragging) {
                    this.drop_index = this.index_for_y(me.clientY);
                    this.render();
                    if (ghost) {
                        ghost.style.top = `${me.clientY}px`;
                    }
                }
            };

            const on_up = () => {
                document.removeEventListener("pointermove", on_move);
                document.removeEventListener("pointerup", on_up);
                ghost?.remove();

                if (dragging) {
                    if (
                        this.drag_id !== undefined &&
                        this.drop_index !== undefined
                    ) {
                        this.move_item(this.drag_id, this.drop_index);
                    }
                    this.drag_id = undefined;
                    this.drop_index = undefined;
                    this.render();
                }
            };

            document.addEventListener("pointermove", on_move);
            document.addEventListener("pointerup", on_up);
            e.preventDefault();
        });
    }

    private index_for_y(client_y: number): number {
        const rows = Array.from(
            this.div.querySelectorAll<HTMLElement>("[data-item-id]"),
        );
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (client_y < rect.top + rect.height / 2) return i;
        }
        return rows.length;
    }

    private render(): void {
        this.div.innerHTML = "";

        for (let i = 0; i < this.items.length; i++) {
            if (this.drag_id !== undefined && this.drop_index === i) {
                this.div.append(this.render_drop_line());
            }
            this.div.append(this.render_row(this.items[i]));
        }

        if (
            this.drag_id !== undefined &&
            this.drop_index === this.items.length
        ) {
            this.div.append(this.render_drop_line());
        }

        this.div.append(this.render_add_row());
    }

    private render_drop_line(): HTMLDivElement {
        const line = document.createElement("div");
        line.style.height = "3px";
        line.style.backgroundColor = colors.primary;
        line.style.borderRadius = "2px";
        return line;
    }

    private render_row(item: InternalItem): HTMLDivElement {
        const row = document.createElement("div");
        row.dataset.itemId = String(item.id);
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "4px 2px";
        row.style.fontSize = "18px";

        if (this.drag_id === item.id) {
            row.style.opacity = "0.3";
        }

        const drag_handle = render_drag_handle();
        this.wire_drag(drag_handle, row, item.id);

        const content = render_item_content(item.data);
        apply_done_style(content, item.done);

        row.append(
            drag_handle,
            render_done_button(item.done, () => this.toggle_done(item.id)),
            content,
            render_remove_button(() => this.remove_item(item.id)),
        );
        return row;
    }

    private render_add_row(): HTMLDivElement {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.marginTop = "12px";

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Add item…";
        input.style.flex = "1";
        input.style.fontSize = "18px";
        input.style.padding = "4px 8px";

        const add_button = document.createElement("button");
        add_button.innerText = "Add";
        add_button.style.fontSize = "18px";
        add_button.style.padding = "4px 12px";

        const submit = () => {
            const text = input.value.trim();
            if (text) {
                input.value = "";
                this.add_text_item(text);
            }
        };

        add_button.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit();
        });

        row.append(input, add_button);
        return row;
    }
}

// --- Import from starred messages ---

function import_starred_messages(reading_list: ReadingList): void {
    const starred = [...DB.message_map.values()]
        .filter((m) => is_starred(m.id))
        .sort((a, b) => b.timestamp - a.timestamp);

    for (const message of starred) {
        const row = new MessageRow(message);
        reading_list.add_address_link_item(row.address());
    }
}

function maybe_show_import_banner(
    reading_list: ReadingList,
    container: HTMLDivElement,
): void {
    if (reading_list.item_count() > 0) return;
    if (DB.starred_ids.size === 0) return;

    const banner = document.createElement("div");
    banner.style.padding = "12px";
    banner.style.marginBottom = "12px";
    banner.style.border = `1px solid ${colors.accent_border}`;
    banner.style.borderRadius = "8px";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "10px";
    header.style.marginBottom = "8px";

    const avatar = document.createElement("img");
    avatar.src = "images/angry_cat.png";
    avatar.style.width = "40px";
    avatar.style.height = "40px";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";

    const name = document.createElement("span");
    name.innerText = "Angry Cat says:";
    name.style.fontWeight = "bold";
    name.style.color = colors.primary;

    header.append(avatar, name);
    banner.append(header);

    const text = document.createElement("div");
    text.style.fontSize = "14px";
    text.style.lineHeight = "1.5";
    text.style.marginBottom = "10px";
    text.innerText = `Your reading list is empty, but you have ${DB.starred_ids.size} starred message${DB.starred_ids.size === 1 ? "" : "s"}. Want to import them as reading list items?`;
    banner.append(text);

    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "6px";

    const no_thanks = new Button("No thanks", 100, () => {
        banner.remove();
    });
    const import_button = new Button("Import", 100, () => {
        const count = DB.starred_ids.size;
        import_starred_messages(reading_list);
        banner.remove();
        StatusBar.celebrate(
            `Imported ${count} starred message${count === 1 ? "" : "s"} into your reading list!`,
        );
    });

    button_row.append(import_button.div, no_thanks.div);
    banner.append(button_row);

    container.prepend(banner);
    requestAnimationFrame(() => import_button.focus());
}

// --- Plugin entry point ---

export function plugin(context: PluginContext): Plugin {
    context.update_label("Reading List");

    const reading_list = new ReadingList();
    APP.set_reading_list(reading_list);

    const container = document.createElement("div");
    container.append(reading_list.div);

    maybe_show_import_banner(reading_list, container);

    return { div: container };
}
