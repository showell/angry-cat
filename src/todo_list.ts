import type { Address } from "./address";

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
};

let next_id = 1;

export class TodoList {
    div: HTMLDivElement;
    items: InternalItem[];
    params: TodoListParams;
    drag_id: number | undefined;
    drop_index: number | undefined;

    constructor(params: TodoListParams) {
        this.params = params;
        this.items = [];
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

    add_text_item(text: string): void {
        this.items.push({
            id: next_id++,
            done: false,
            data: { kind: "text", text },
        });
        this.render();
    }

    add_address_link_item(address: Address): void {
        this.items.push({
            id: next_id++,
            done: false,
            data: { kind: "address_link", address },
        });
        this.render();
    }

    remove_item(id: number): void {
        const item = this.items.find((item) => item.id === id);
        if (item) {
            this.params.on_remove(item.data);
        }
        this.items = this.items.filter((item) => item.id !== id);
        this.render();
    }

    toggle_done(id: number): void {
        const item = this.items.find((item) => item.id === id);
        if (item) {
            item.done = !item.done;
            this.render();
        }
    }

    move_item(from_id: number, to_index: number): void {
        const from_index = this.items.findIndex((item) => item.id === from_id);
        if (from_index === -1) return;
        const [item] = this.items.splice(from_index, 1);
        this.items.splice(to_index, 0, item);
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
        line.style.backgroundColor = "#000080";
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

        const drag_handle = document.createElement("span");
        drag_handle.innerText = "☰";
        drag_handle.style.cursor = "grab";
        drag_handle.style.opacity = "0.4";
        drag_handle.style.fontSize = "20px";
        drag_handle.style.userSelect = "none";
        this.wire_drag(drag_handle, item.id);

        const done_button = document.createElement("button");
        done_button.innerText = item.done ? "✓" : "○";
        done_button.style.minWidth = "32px";
        done_button.style.fontSize = "18px";
        done_button.style.padding = "2px 6px";
        done_button.addEventListener("click", () => this.toggle_done(item.id));

        const content = this.params.render_content(item.data);
        content.style.flex = "1";
        content.style.fontSize = "18px";
        if (item.done) {
            content.style.textDecoration = "line-through";
            content.style.opacity = "0.5";
        }

        const remove_button = document.createElement("button");
        remove_button.innerText = "✕";
        remove_button.style.opacity = "0.5";
        remove_button.style.fontSize = "16px";
        remove_button.style.padding = "2px 6px";
        remove_button.addEventListener("click", () =>
            this.remove_item(item.id),
        );

        row.append(drag_handle, done_button, content, remove_button);
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
