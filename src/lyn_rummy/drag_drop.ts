// Drag-and-drop for card stacks and hand cards.
//
// Two classes:
//   DragDropHelper — registry for drop targets and click handlers.
//   DragSession — per-drag state machine, created by enable_drag.
//
// Game-specific behavior is injected via DragCallbacks.

function pixels(num: number): string {
    return `${num}px`;
}

export function rects_overlap(
    rect1: { left: number; right: number; top: number; bottom: number },
    rect2: { left: number; right: number; top: number; bottom: number },
): boolean {
    return !(
        rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom
    );
}

export type DropTarget = {
    div: HTMLElement;
    on_over: () => void;
    on_leave: () => void;
    on_drop: () => void;
};

export type DragCallbacks = {
    is_inside_board: (div: HTMLElement) => boolean;
    on_reject: (div: HTMLElement) => void;
    on_redraw: () => void;
};

// --- DragSession: one per drag gesture ---

class DragSession {
    private div: HTMLElement;
    private registry: DragDropHelper;
    private handle_dragstart: () => void;
    private handle_ordinary_move: () => void;

    private dragging = false;
    private drag_started = false;
    private active_click_key: string | undefined;
    private active_target: DropTarget | undefined;
    private orig_x = 0;
    private orig_y = 0;
    private orig_top = 0;
    private orig_left = 0;

    constructor(
        div: HTMLElement,
        registry: DragDropHelper,
        handle_dragstart: () => void,
        handle_ordinary_move: () => void,
    ) {
        this.div = div;
        this.registry = registry;
        this.handle_dragstart = handle_dragstart;
        this.handle_ordinary_move = handle_ordinary_move;

        div.draggable = true;
        div.style.userSelect = "";
        div.style.touchAction = "none";

        div.addEventListener("pointerdown", (e) => this.on_pointerdown(e));
        div.addEventListener("pointermove", (e) => this.on_pointermove(e));
        div.addEventListener("pointerup", (e) => this.on_pointerup(e));
    }

    private dist_squared(e: PointerEvent): number {
        return (this.orig_x - e.clientX) ** 2 + (this.orig_y - e.clientY) ** 2;
    }

    private find_click_key(e: PointerEvent): string | undefined {
        const elements = document.elementsFromPoint(
            e.clientX, e.clientY,
        ) as HTMLElement[];

        for (const element of elements) {
            if (element.dataset.click_key) {
                return element.dataset.click_key;
            }
        }
        return undefined;
    }

    private find_hovered_target(): DropTarget | undefined {
        const elements = document.querySelectorAll(".drop_target") as any;
        const div_rect = this.div.getBoundingClientRect();

        for (const element of elements) {
            if (rects_overlap(div_rect, element.getBoundingClientRect())) {
                const drop_key = element.dataset.drop_key;
                const target = this.registry.drop_targets.get(drop_key);
                if (target !== undefined) return target;
            }
        }
        return undefined;
    }

    private update_hover(hovered: DropTarget | undefined): void {
        if (hovered === this.active_target) return;

        if (this.active_target) {
            this.active_target.on_leave();
        }
        if (hovered) {
            hovered.on_over();
        }
        this.active_target = hovered;
    }

    private on_pointerdown(e: PointerEvent): void {
        e.preventDefault();

        this.dragging = true;
        this.drag_started = false;
        this.active_target = undefined;
        this.active_click_key = this.find_click_key(e);

        this.registry.drop_targets.clear();

        this.div.setPointerCapture(e.pointerId);

        this.orig_x = e.clientX;
        this.orig_y = e.clientY;
        this.orig_left = this.div.offsetLeft;
        this.orig_top = this.div.offsetTop;
    }

    private on_pointermove(e: PointerEvent): void {
        if (!this.dragging) return;

        if (!this.drag_started) {
            this.div.style.position = "absolute";
            this.div.style.zIndex = "2";
            this.div.style.cursor = "grabbing";
            this.handle_dragstart();
            this.drag_started = true;
        }

        this.div.style.left = pixels(this.orig_left + e.clientX - this.orig_x);
        this.div.style.top = pixels(this.orig_top + e.clientY - this.orig_y);

        if (this.dist_squared(e) > 1) {
            this.active_click_key = undefined;
        }

        this.update_hover(this.find_hovered_target());
    }

    private on_pointerup(e: PointerEvent): void {
        e.preventDefault();

        if (this.dist_squared(e) > 1) {
            this.active_click_key = undefined;
        }

        this.div.releasePointerCapture(e.pointerId);

        // Clear hover state.
        this.update_hover(undefined);

        // Clicks take precedence over drops.
        if (this.active_click_key) {
            const on_click = this.registry.on_click_callbacks.get(this.active_click_key);
            if (on_click) {
                on_click();
                this.finish();
                return;
            }
        }

        // Reject if dropped outside the board.
        if (!this.registry.callbacks.is_inside_board(this.div)) {
            this.registry.callbacks.on_reject(this.div);
            this.finish();
            return;
        }

        // Drop on target or ordinary move.
        const target = this.find_hovered_target();
        if (target) {
            target.on_drop();
        } else {
            this.handle_ordinary_move();
        }

        this.finish();
    }

    private finish(): void {
        this.registry.reset();
        this.registry.callbacks.on_redraw();

        this.dragging = false;
        this.drag_started = false;
        this.active_click_key = undefined;
        this.active_target = undefined;
    }
}

// --- DragDropHelper: registry + session factory ---

export class DragDropHelper {
    private seq = 0;
    drop_targets: Map<string, DropTarget> = new Map();
    on_click_callbacks: Map<string, () => void> = new Map();
    callbacks: DragCallbacks;

    constructor(callbacks: DragCallbacks) {
        this.callbacks = callbacks;
    }

    reset(): void {
        this.on_click_callbacks.clear();
        this.drop_targets.clear();
    }

    enable_drag(info: {
        div: HTMLElement;
        handle_dragstart: () => void;
        handle_ordinary_move: () => void;
    }): void {
        new DragSession(
            info.div, this,
            info.handle_dragstart,
            info.handle_ordinary_move,
        );
    }

    accept_click(info: { div: HTMLElement; on_click: () => void }): void {
        const key = this.new_key();
        info.div.style.touchAction = "none";
        info.div.dataset.click_key = key;
        this.on_click_callbacks.set(key, info.on_click);
    }

    accept_drop(drop_target: DropTarget): void {
        const key = this.new_key();
        drop_target.div.classList.add("drop_target");
        drop_target.div.dataset.drop_key = key;
        this.drop_targets.set(key, drop_target);
    }

    private new_key(): string {
        this.seq += 1;
        return `${this.seq}`;
    }
}
