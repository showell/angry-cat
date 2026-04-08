const prefix = "ANGRY_CAT_REALM:";

function namespaced_key_for(key: string) {
    return prefix + key;
}
export function get(key: string): string | null {
    return localStorage.getItem(namespaced_key_for(key));
}

export function remove(key: string) {
    localStorage.removeItem(namespaced_key_for(key));
}

export function set(key: string, obj: Record<string, unknown>) {
    localStorage.setItem(namespaced_key_for(key), JSON.stringify(obj));
}

export function get_item_count() {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
            count++;
        }
    }

    return count;
}

export function get_all_items(): Record<string, string> {
    const items: Record<string, string> = {};

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key && key.startsWith(prefix)) {
            const value = localStorage.getItem(key);

            if (value !== null) {
                items[key] = value;
            }
        }
    }

    return items;
}
