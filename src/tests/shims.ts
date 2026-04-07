// Minimal shims for browser globals that some modules reference at
// import time. These are intentionally bare-bones — just enough to
// prevent ReferenceErrors during test imports.

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

(globalThis as any).document = {
    hidden: false,
    addEventListener: () => {},
    createElement: () => ({}),
    querySelector: () => null,
};
