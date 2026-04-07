// Minimal shims for browser globals. These are intentionally
// hand-rolled so we can inspect event listeners and DOM structure
// in tests without pulling in jsdom or happy-dom.

// --- localStorage ---

const storage = new Map<string, string>();

(globalThis as any).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    get length() {
        return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    clear: () => storage.clear(),
};

// --- DOM ---

type Listener = { type: string; handler: Function };

class MockElement {
    tagName: string;
    children: MockElement[] = [];
    dataset: Record<string, string> = {};
    _listeners: Listener[] = [];
    _attributes: Record<string, string> = {};
    _innerHTML = "";
    _innerText = "";
    _textContent = "";
    _classList: Set<string> = new Set();

    // style is a no-op bag — any property can be set without error.
    style: Record<string, string> = new Proxy(
        {},
        { set: (_t, _p, _v) => true, get: () => "" },
    );

    constructor(tag: string) {
        this.tagName = tag.toUpperCase();
    }

    // --- Content ---

    get innerHTML(): string {
        return this._innerHTML || this._serialize_children();
    }
    set innerHTML(val: string) {
        this._innerHTML = val;
        if (val === "") this.children = [];
    }

    get innerText(): string {
        return this._innerText;
    }
    set innerText(val: string) {
        this._innerText = val;
        this._textContent = val;
    }

    get textContent(): string {
        return this._textContent || this._innerText;
    }
    set textContent(val: string) {
        this._textContent = val;
    }

    // Property accessors use _attributes bag — any element property
    // (src, type, checked, value, placeholder, etc.) can be get/set
    // without needing individual definitions.
    [key: string]: any;

    get classList() {
        const self = this._classList;
        return {
            add: (...names: string[]) => names.forEach((n) => self.add(n)),
            remove: (...names: string[]) => names.forEach((n) => self.delete(n)),
            contains: (name: string) => self.has(name),
            toggle: (name: string) => {
                if (self.has(name)) self.delete(name);
                else self.add(name);
            },
        };
    }

    // --- Tree ---

    append(...nodes: any[]): void {
        for (const node of nodes) {
            if (node instanceof MockElement) {
                this.children.push(node);
            }
        }
    }

    prepend(...nodes: any[]): void {
        for (const node of nodes.reverse()) {
            if (node instanceof MockElement) {
                this.children.unshift(node);
            }
        }
    }

    querySelectorAll(selector: string): MockElement[] {
        const results: MockElement[] = [];
        this._walk((el) => {
            if (el._matches_selector(selector)) results.push(el);
        });
        return results;
    }

    querySelector(selector: string): MockElement | null {
        const all = this.querySelectorAll(selector);
        return all.length > 0 ? all[0] : null;
    }

    // --- Events ---

    addEventListener(type: string, handler: Function): void {
        this._listeners.push({ type, handler });
    }

    removeEventListener(): void {}

    // Fire all listeners of the given type.
    _fire(type: string, event?: any): Function[] {
        const called: Function[] = [];
        for (const l of this._listeners) {
            if (l.type === type) {
                l.handler(event ?? {});
                called.push(l.handler);
            }
        }
        return called;
    }

    getAttribute(name: string): string | null {
        return this._attributes[name] ?? null;
    }

    setAttribute(name: string, value: string): void {
        this._attributes[name] = value;
    }

    removeAttribute(name: string): void {
        delete this._attributes[name];
    }

    focus(): void {}
    showModal(): void {}
    close(): void {}
    remove(): void {}

    cloneNode(_deep?: boolean): MockElement {
        return new MockElement(this.tagName);
    }

    getBoundingClientRect() {
        return { top: 0, left: 0, width: 100, height: 20 };
    }

    // --- Internal ---

    _walk(fn: (el: MockElement) => void): void {
        fn(this);
        for (const child of this.children) {
            child._walk(fn);
        }
    }

    _matches_selector(selector: string): boolean {
        if (selector.startsWith(".")) {
            return this._classList.has(selector.slice(1));
        }
        if (selector.includes(".")) {
            const [tag, cls] = selector.split(".");
            return (
                this.tagName === tag.toUpperCase() && this._classList.has(cls)
            );
        }
        return this.tagName === selector.toUpperCase();
    }

    _serialize_children(): string {
        return this.children
            .map(
                (c) => c._innerText || c._textContent || c._serialize_children(),
            )
            .join("");
    }

    _all_text(): string {
        let text = this._innerText + this._textContent + this._innerHTML;
        for (const child of this.children) {
            text += child._all_text();
        }
        return text;
    }
}

function createElement(tag: string): MockElement {
    const el = new MockElement(tag);

    // <template> elements need a .content property. We treat the
    // template as a black box — querySelectorAll returns empty.
    if (tag === "template") {
        const content = new MockElement("fragment");
        content.querySelectorAll = () => [];
        content.querySelector = () => null;

        Object.defineProperty(el, "content", { get: () => content });
        Object.defineProperty(el, "innerHTML", {
            set(html: string) { content._innerHTML = html; },
            get() { return content._innerHTML; },
        });
    }

    return el;
}

const body = new MockElement("body");

(globalThis as any).document = {
    hidden: false,
    addEventListener: () => {},
    createElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
    body,
};

(globalThis as any).window = {
    location: { pathname: "/", search: "", origin: "http://localhost:8000" },
};

// DOMParser mock — used only by parse.ts to detect code blocks,
// images, and mentions in message HTML.
(globalThis as any).DOMParser = class {
    parseFromString(html: string): any {
        return {
            querySelector(selector: string): MockElement | null {
                if (selector.startsWith("div.") || selector.startsWith("span.")) {
                    const cls = selector.split(".")[1];
                    if (html.includes(`class="${cls}"`)) return new MockElement("div");
                }
                if (selector === "img" && html.includes("<img")) return new MockElement("img");
                return null;
            },
            querySelectorAll(selector: string): MockElement[] {
                if (selector === "span.user-mention") {
                    const results: MockElement[] = [];
                    const regex = /data-user-id="(\d+)"/g;
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        const el = new MockElement("span");
                        el._classList.add("user-mention");
                        el.setAttribute("data-user-id", match[1]);
                        results.push(el);
                    }
                    return results;
                }
                return [];
            },
        };
    }
};

// --- StatusBar stub ---

import { set_status_bar_for_testing } from "../status_bar";

const status_messages: string[] = [];

set_status_bar_for_testing({
    inform: (msg: string) => { status_messages.push(msg); },
    scold: (msg: string) => { status_messages.push(msg); },
    celebrate: (msg: string) => { status_messages.push(msg); },
    persist: (msg: string) => { status_messages.push(msg); },
    clear: () => {},
} as any);

export function get_last_status(): string | undefined {
    return status_messages[status_messages.length - 1];
}

export { MockElement };
