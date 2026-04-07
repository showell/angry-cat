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

    get src(): string {
        return this._attributes["src"] ?? "";
    }
    set src(val: string) {
        this._attributes["src"] = val;
    }

    get type(): string {
        return this._attributes["type"] ?? "";
    }
    set type(val: string) {
        this._attributes["type"] = val;
    }

    get checked(): boolean {
        return this._attributes["checked"] === "true";
    }
    set checked(val: boolean) {
        this._attributes["checked"] = String(val);
    }

    get title(): string {
        return this._attributes["title"] ?? "";
    }
    set title(val: string) {
        this._attributes["title"] = val;
    }

    get placeholder(): string {
        return this._attributes["placeholder"] ?? "";
    }
    set placeholder(val: string) {
        this._attributes["placeholder"] = val;
    }

    get required(): boolean {
        return this._attributes["required"] === "true";
    }
    set required(val: boolean) {
        this._attributes["required"] = String(val);
    }

    get tabIndex(): number {
        return parseInt(this._attributes["tabIndex"] ?? "-1");
    }
    set tabIndex(val: number) {
        this._attributes["tabIndex"] = String(val);
    }

    get value(): string {
        return this._attributes["value"] ?? "";
    }
    set value(val: string) {
        this._attributes["value"] = val;
    }

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

    set onsubmit(fn: Function) {
        this._listeners.push({ type: "submit", handler: fn });
    }

    // --- Tree ---

    append(...nodes: any[]): void {
        for (const node of nodes) {
            if (node instanceof MockElement) {
                this.children.push(node);
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

    // Fire all listeners of the given type. Returns the handlers
    // that were called (useful for assertions).
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

    // --- Internal ---

    _walk(fn: (el: MockElement) => void): void {
        fn(this);
        for (const child of this.children) {
            child._walk(fn);
        }
    }

    _matches_selector(selector: string): boolean {
        // Very minimal: supports "div", ".class", "tag.class"
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

    // Collect all text content recursively (for searching).
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
    // template as a black box — render_message_content passes HTML
    // through it, and we just need the content to survive as text.
    // querySelectorAll on content returns empty (no real parsing).
    if (tag === "template") {
        const content = new MockElement("fragment");
        content.querySelectorAll = () => [];
        content.querySelector = () => null;

        Object.defineProperty(el, "content", { get: () => content });
        Object.defineProperty(el, "innerHTML", {
            set(html: string) {
                content._innerHTML = html;
            },
            get() {
                return content._innerHTML;
            },
        });
    }

    return el;
}

(globalThis as any).document = {
    hidden: false,
    addEventListener: () => {},
    createElement,
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
};

(globalThis as any).window = {
    location: { pathname: "/", search: "", origin: "http://localhost:8000" },
};

(globalThis as any).DOMParser = class {
    parseFromString(html: string): any {
        // Minimal: just return an object with querySelector that
        // can find things by class in the raw HTML string.
        return {
            querySelector(selector: string): MockElement | null {
                if (selector.startsWith("div.") || selector.startsWith("span.")) {
                    const cls = selector.split(".")[1];
                    if (html.includes(`class="${cls}"`)) {
                        return new MockElement("div");
                    }
                }
                if (selector === "img" && html.includes("<img")) {
                    return new MockElement("img");
                }
                return null;
            },
            querySelectorAll(selector: string): MockElement[] {
                const results: MockElement[] = [];
                if (selector === "span.user-mention") {
                    // Extract data-user-id from HTML
                    const regex = /data-user-id="(\d+)"/g;
                    let match;
                    while ((match = regex.exec(html)) !== null) {
                        const el = new MockElement("span");
                        el._classList.add("user-mention");
                        el.setAttribute("data-user-id", match[1]);
                        results.push(el);
                    }
                }
                return results;
            },
        };
    }
};

// Export MockElement so tests can use it for type assertions.
export { MockElement };
