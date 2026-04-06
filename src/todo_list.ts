import type { Address } from "./address";
import * as colors from "./colors";
import * as local_storage from "./localstorage";

export type TodoItemData =
    | { kind: "text"; text: string }
    | { kind: "address_link"; address: Address };

type InternalItem = {
    id: number;
    done: boolean;
    data: TodoItemData;
};

export type TodoListParams = {
    render_content: (data: TodoItemData) => HTMLElement;
    on_remove: (data: TodoItemData) => void;
    storage_key?: string;
};

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

let next_id = 1;

export class TodoList {
    div: HTMLDivElement;
    items: InternalItem[];
    params: TodoListParams;
    drag_id: number | undefined;
    drop_index: number | undefined;

    constructor(params: TodoListParams) {
        this.params = params;
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

    // Persist the item list to localStorage so it survives page reloads.
    private save(): void {
        const key = this.params.storage_key;
        if (!key) return;
        const data = this.items.map((item) => ({
            done: item.done,
            data: item.data,
        }));
        local_storage.set(key, { items: data });
    }

    private load(): InternalItem[] {
        const key = this.params.storage_key;
        if (!key) return [];
        const raw = local_storage.get(key);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.items)) return [];
        return parsed.items.map(
            (entry: { done: boolean; data: TodoItemData }) => ({
                id: next_id++,
                done: entry.done,
                data: entry.data,
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

    remove_item(id: number): void {
        const item = this.items.find((item) => item.id === id);
        if (item) {
            this.params.on_remove(item.data);
        }
        this.items = this.items.filter((item) => item.id !== id);
        this.save();
        this.render();
    }

    toggle_done(id: number): void {
        const item = this.items.find((item) => item.id === id);
        if (item) {
            item.done = !item.done;
            this.save();
            this.render();
        }
    }

    move_item(from_id: number, to_index: number): void {
        const from_index = this.items.findIndex((item) => item.id === from_id);
        if (from_index === -1) return;
        const [item] = this.items.splice(from_index, 1);
        this.items.splice(to_index, 0, item);
        this.save();
    }

    wire_drag(handle: HTMLElement, item_id: number): void {
        handle.addEventListener("mousedown", (e: MouseEvent) => {
            this.drag_id = item_id;
            this.drop_index = this.items.findIndex((i) => i.id === item_id);
            this.render();

            const on_move = (e: MouseEvent) => {
                this.drop_index = this.index_for_y(e.clientY);
                this.render();
            };

            document.addEventListener("mousemove", on_move);
            document.addEventListener(
                "mouseup",
                () => {
                    document.removeEventListener("mousemove", on_move);
                    if (
                        this.drag_id !== undefined &&
                        this.drop_index !== undefined
                    ) {
                        this.move_item(this.drag_id, this.drop_index);
                    }
                    this.drag_id = undefined;
                    this.drop_index = undefined;
                    this.render();
                },
                { once: true },
            );

            e.preventDefault();
        });
    }

    index_for_y(client_y: number): number {
        const rows = Array.from(
            this.div.querySelectorAll<HTMLElement>("[data-todo-id]"),
        );
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (client_y < rect.top + rect.height / 2) return i;
        }
        return rows.length;
    }

    render(): void {
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

    render_drop_line(): HTMLDivElement {
        const line = document.createElement("div");
        line.style.height = "3px";
        line.style.backgroundColor = colors.primary;
        line.style.borderRadius = "2px";
        return line;
    }

    render_row(item: InternalItem): HTMLDivElement {
        const row = document.createElement("div");
        row.dataset.todoId = String(item.id);
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "4px 2px";
        row.style.fontSize = "18px";

        if (this.drag_id === item.id) {
            row.style.opacity = "0.3";
        }

        const drag_handle = render_drag_handle();
        this.wire_drag(drag_handle, item.id);

        const content = this.params.render_content(item.data);
        apply_done_style(content, item.done);

        row.append(
            drag_handle,
            render_done_button(item.done, () => this.toggle_done(item.id)),
            content,
            render_remove_button(() => this.remove_item(item.id)),
        );
        return row;
    }

    render_add_row(): HTMLDivElement {
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
