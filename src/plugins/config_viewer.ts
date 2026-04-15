import * as config from "../backend/config";
import type { Plugin, PluginContext } from "../plugin_helper";

function create_realm_card(realm: config.RealmConfig): HTMLDivElement {
    const card = document.createElement("div");
    card.style.border = "1px solid #ccc";
    card.style.borderRadius = "6px";
    card.style.padding = "12px";
    card.style.marginBottom = "10px";

    function add_row(label: string, value: string): void {
        const row = document.createElement("div");
        row.style.marginBottom = "6px";

        const bold = document.createElement("strong");
        bold.textContent = label + ": ";
        row.append(bold);

        const span = document.createElement("span");
        span.textContent = value;
        row.append(span);

        card.append(row);
    }

    add_row("Realm", realm.nickname);
    add_row("URL", realm.url);

    // Zulip-only: email + API key. Gopher realms don't carry credentials.
    if (realm.email !== undefined) {
        add_row("Email", realm.email);
    }

    if (realm.api_key !== undefined) {
        const key_row = document.createElement("div");
        key_row.style.marginBottom = "6px";

        const key_label = document.createElement("strong");
        key_label.textContent = "API Key: ";
        key_row.append(key_label);

        const key_value = document.createElement("span");
        key_value.textContent = "••••••••";
        key_row.append(key_value);

        const reveal_btn = document.createElement("button");
        reveal_btn.textContent = "Reveal";
        reveal_btn.style.marginLeft = "8px";
        reveal_btn.style.fontSize = "12px";
        const api_key = realm.api_key;
        reveal_btn.addEventListener("click", () => {
            const hidden = key_value.textContent === "••••••••";
            key_value.textContent = hidden ? api_key : "••••••••";
            reveal_btn.textContent = hidden ? "Hide" : "Reveal";
        });
        key_row.append(reveal_btn);

        card.append(key_row);
    }

    return card;
}

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");
    div.style.padding = "10px";

    context.update_label("Config");

    const realms = config.get_available_realms();

    if (realms.length === 0) {
        div.textContent = "No stored credentials.";
        return { div };
    }

    for (const realm of realms) {
        div.append(create_realm_card(realm));
    }

    return { div };
}
