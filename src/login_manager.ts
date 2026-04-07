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

// --- Invite redemption ---

// Check if the URL has an ?invite=TOKEN param. If so, redeem it
// against the server, store the credentials, and redirect to the
// clean realm URL.
async function try_redeem_invite(nickname: string): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return false;

    const realm_url = KNOWN_REALMS[nickname];

    show_status("Redeeming invite...");

    const response = await fetch(`${realm_url}/api/v1/invites/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
    });
    const data = await response.json();

    if (data.result !== "success") {
        show_status(`Invite failed: ${data.msg}`);
        return true; // handled (even though it failed)
    }

    const new_realm: RealmConfig = {
        nickname,
        url: realm_url,
        email: data.email,
        api_key: data.api_key,
    };

    config.store_realm_config(new_realm);

    // Redirect to the clean URL (without the invite param).
    window.location.replace(import.meta.env.BASE_URL + nickname);
    return true;
}

function show_status(message: string): void {
    const div = document.createElement("div");
    div.style.padding = "20px";
    div.style.fontSize = "16px";
    div.textContent = message;
    document.body.append(div);
}

// --- Normal login ---

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

// needs_to_login is async because invite redemption requires a
// network call. Returns true if the app should stop (login needed
// or invite being processed).
export async function needs_to_login(): Promise<boolean> {
    const nickname = get_realm_nickname_from_url();

    if (nickname === undefined) {
        start_login_process();
        return true;
    }

    // Check for invite link before checking stored credentials.
    const handled = await try_redeem_invite(nickname);
    if (handled) return true;

    const realm_config = config.get_realm_config(nickname);
    if (realm_config === undefined) {
        start_login_process(nickname);
        return true;
    }

    config.set_current_realm_config(realm_config);
    return false;
}
