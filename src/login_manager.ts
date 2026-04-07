import * as config from "./backend/config";
import type { RealmConfig } from "./backend/config";

// Known realms and their server URLs. When a user logs in, we pair
// their credentials with the URL for the chosen realm.
const KNOWN_REALMS: Record<string, string> = {
    mac: "https://macandcheese.zulipchat.com",
    gopher: "http://localhost:9000",
};

function get_realm_nickname_from_url(): string | undefined {
    const parts = window.location.pathname
        .split("/")
        .filter((part) => part !== "");
    if (parts.length === 0) return undefined;
    const candidate = parts[parts.length - 1];
    if (candidate in KNOWN_REALMS) return candidate;
    return undefined;
}

class LoginManager {
    div: HTMLDivElement;
    content_div: HTMLDivElement;

    constructor() {
        const div = document.createElement("div");

        const heading = document.createElement("div");
        heading.innerText = "Login To Zulip";
        heading.style.fontWeight = "bold";
        heading.style.marginBottom = "10px";
        div.append(heading);

        // A dedicated container so we can easily swap between the list and the form
        this.content_div = document.createElement("div");
        div.append(this.content_div);

        this.div = div;
    }

    start(default_nickname?: string): void {
        this.content_div.innerHTML = "";
        this.render_login_form(default_nickname);
    }

    private render_login_form(default_nickname?: string): void {
        this.content_div.innerHTML = "";

        const form = document.createElement("form");
        form.style.gap = "8px";

        // Realm selector
        const realm_info = this.create_select_box(
            "Realm",
            Object.keys(KNOWN_REALMS),
            default_nickname,
        );

        const email_info = this.create_input_box("email", "Email Address");
        const api_key_info = this.create_input_box("password", "API Key");

        const submit_btn = document.createElement("button");
        submit_btn.type = "submit";
        submit_btn.innerText = "Save and Login";

        form.append(realm_info.div, email_info.div, api_key_info.div, submit_btn);

        form.onsubmit = (e) => {
            e.preventDefault();
            const nickname = realm_info.select.value;
            const new_realm: RealmConfig = {
                nickname,
                url: KNOWN_REALMS[nickname],
                email: email_info.input.value,
                api_key: api_key_info.input.value,
            };

            config.store_realm_config(new_realm);
            window.location.replace(import.meta.env.BASE_URL + nickname);
        };

        this.content_div.append(form);
    }

    private create_select_box(
        label: string,
        options: string[],
        default_value?: string,
    ): { div: HTMLDivElement; select: HTMLSelectElement } {
        const field = document.createElement("div");
        field.innerText = label;
        field.style.width = "120px";
        field.style.fontSize = "16px";

        const select = document.createElement("select");
        select.style.width = "340px";
        select.style.fontSize = "16px";
        for (const opt of options) {
            const option = document.createElement("option");
            option.value = opt;
            option.text = opt;
            if (opt === default_value) option.selected = true;
            select.append(option);
        }

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.marginBottom = "20px";
        div.append(field);
        div.append(select);
        return { div, select };
    }

    private create_input_box(
        type: string,
        label: string,
    ): { div: HTMLDivElement; input: HTMLInputElement } {
        const field = document.createElement("div");
        field.innerText = label;
        field.style.width = "120px";
        field.style.fontSize = "16px";

        const input = document.createElement("input");
        input.type = type;
        input.placeholder = label;
        input.required = true;
        input.style.width = "340px";
        input.style.fontSize = "16px";

        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.marginBottom = "20px";
        div.append(field);
        div.append(input);
        return { div, input };
    }
}

function start_login_process(default_nickname?: string) {
    const login_manager = new LoginManager();
    document.body.append(login_manager.div);
    login_manager.start(default_nickname);
}

export function needs_to_login(): boolean {
    const nickname = get_realm_nickname_from_url();

    if (nickname === undefined) {
        // No realm in URL — show login form so the user can pick one.
        start_login_process();
        return true;
    }

    const realm_config = config.get_realm_config(nickname);
    if (realm_config === undefined) {
        // Realm recognized but no stored credentials — show login form
        // with the realm pre-selected.
        start_login_process(nickname);
        return true;
    }

    config.set_current_realm_config(realm_config);
    return false;
}
