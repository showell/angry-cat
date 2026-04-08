export type RealmConfig = {
    email: string;
    api_key: string;
    url: string;
    nickname: string;
};

import * as local_storage from "../localstorage";

let current_realm_config: RealmConfig;

// login_manager should be the only caller for this unless
// we somehow want to support multiple sessions in a single tab.
export function set_current_realm_config(config: RealmConfig) {
    current_realm_config = config;
}

export function get_realm_config(nickname: string): RealmConfig | undefined {
    const config_str = local_storage.get(nickname);
    if (config_str === null) return undefined;
    return JSON.parse(config_str);
}

export function store_realm_config(realm_config: RealmConfig): void {
    local_storage.set(realm_config.nickname, realm_config);
}

export function get_available_realms(): RealmConfig[] {
    const realms: RealmConfig[] = [];
    const serialized_realms = local_storage.get_all_items();

    for (const realm_config_str of Object.values(serialized_realms)) {
        try {
            realms.push(JSON.parse(realm_config_str));
        } catch (error) {
            console.error("Failed to parse realm config:", error);
        }
    }

    return realms;
}

export function set_current_realm(nickname: string) {
    const config = get_realm_config(nickname);
    if (config === undefined) {
        throw new Error("Realm config with nickname not found");
    }
    current_realm_config = config;
}

export function get_current_realm_config(): RealmConfig | undefined {
    return current_realm_config;
}

export function get_current_realm_url(): string {
    return current_realm_config!.url;
}

export function get_email_for_current_realm() {
    return current_realm_config?.email;
}

export function get_current_realm_nickname() {
    return current_realm_config?.nickname;
}

export function get_api_key_for_current_realm() {
    return current_realm_config?.api_key;
}

// Returns true when connected to an Angry Gopher server (vs. Zulip).
// Gopher-only features (invites, etc.) check this before showing.
export function is_gopher_realm(): boolean {
    return current_realm_config?.nickname === "gopher";
}
