import * as config from "./backend/config";
import type { RealmConfig } from "./backend/config";

// Known realms and their server URLs. When a user logs in, we pair
// their credentials with the URL for the chosen realm.
//
// Two gopher realms can coexist in localStorage because they have
// distinct nicknames:
//   - "gopher"      → prod Angry Gopher on port 9000
//   - "gopher_demo" → demo Angry Gopher on port 9001
//
// The single Angry Cat instance (always served on 8000) can be
// logged into either one. Switching between them does not
// overwrite credentials because each nickname has its own
// localStorage entry.
const KNOWN_REALMS: Record<string, string> = {
    mac: "https://macandcheese.zulipchat.com",
    gopher: "http://localhost:9000",
    gopher_demo: "http://localhost:9001",
};

// Gopher realms support invite links and use the /gopher/ namespace.
const GOPHER_REALMS = new Set(["gopher", "gopher_demo"]);

function get_realm_nickname_from_url(): string | undefined {
    const parts = window.location.pathname
        .split("/")
        .filter((part) => part !== "");
    if (parts.length === 0) return undefined;
    const candidate = parts[parts.length - 1];
    if (candidate in KNOWN_REALMS) return candidate;
    return undefined;
}

function realm_label(nickname: string | undefined): string {
    if (nickname === "gopher_demo") {
        return "Login To Angry Gopher (demo)";
    }
    if (nickname && GOPHER_REALMS.has(nickname)) {
        return "Login To Angry Gopher";
    }
    return "Login To Zulip";
}

// --- Invite redemption (Gopher only) ---

async function try_redeem_invite(nickname: string): Promise<boolean> {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return false;

    // Invites only work on Gopher realms.
    if (!GOPHER_REALMS.has(nickname)) return false;

    const realm_url = KNOWN_REALMS[nickname];

    show_status("Redeeming invite...");

    try {
        const response = await fetch(`${realm_url}/gopher/invites/redeem`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }),
        });
        const data = await response.json();

        if (data.result !== "success") {
            show_invite_failure(
                `Invite failed: ${data.msg ?? "unknown error"}`,
                nickname,
            );
            return true;
        }

        const new_realm: RealmConfig = {
            nickname,
            url: realm_url,
            email: data.email,
            api_key: data.api_key,
        };

        config.store_realm_config(new_realm);
        window.location.replace(import.meta.env.BASE_URL + nickname);
        return true;
    } catch {
        show_invite_failure(
            "Could not reach the server. Please check your connection and try again.",
            nickname,
        );
        return true;
    }
}

function show_status(message: string): void {
    const div = document.createElement("div");
    div.style.padding = "20px";
    div.style.fontSize = "16px";
    div.textContent = message;
    document.body.append(div);
}

// Show a failure message with an option to try manual login.
function show_invite_failure(message: string, nickname: string): void {
    const div = document.createElement("div");
    div.style.padding = "20px";

    const msg = document.createElement("div");
    msg.style.fontSize = "16px";
    msg.style.marginBottom = "16px";
    msg.textContent = message;
    div.append(msg);

    const hint = document.createElement("div");
    hint.style.fontSize = "14px";
    hint.style.color = "#666";
    hint.style.marginBottom = "16px";
    hint.textContent = "The invite link may have expired (they are valid for 24 hours). " +
        "Ask the person who invited you for a new link, or log in manually below.";
    div.append(hint);

    const button = document.createElement("button");
    button.innerText = "Log in manually";
    button.style.fontSize = "16px";
    button.style.padding = "8px 16px";
    button.addEventListener("click", () => {
        div.remove();
        start_login_process(nickname);
    });
    div.append(button);

    document.body.append(div);
}

// --- Normal login ---

class LoginManager {
    div: HTMLDivElement;
    content_div: HTMLDivElement;

    constructor(nickname: string | undefined) {
        const div = document.createElement("div");
        div.style.padding = "20px";

        const heading = document.createElement("div");
        heading.innerText = realm_label(nickname);
        heading.style.fontWeight = "bold";
        heading.style.fontSize = "18px";
        heading.style.marginBottom = "10px";
        div.append(heading);

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

        const realm_info = this.create_select_box(
            "Realm",
            Object.keys(KNOWN_REALMS),
            default_nickname,
        );

        const email_info = this.create_input_box("email", "Email Address");
        const api_key_info = this.create_input_box("password", "API Key");

        const status_div = document.createElement("div");
        status_div.style.color = "#c00";
        status_div.style.fontSize = "14px";
        status_div.style.marginTop = "8px";

        const submit_btn = document.createElement("button");
        submit_btn.type = "submit";
        submit_btn.innerText = "Save and Login";

        form.append(
            realm_info.div,
            email_info.div,
            api_key_info.div,
            submit_btn,
            status_div,
        );

        form.onsubmit = async (e) => {
            e.preventDefault();
            const nickname = realm_info.select.value;
            const email = email_info.input.value.trim();
            const api_key = api_key_info.input.value.trim();

            if (!email || !api_key) {
                status_div.textContent = "Please enter both email and API key.";
                return;
            }

            // Verify credentials before saving.
            submit_btn.disabled = true;
            submit_btn.innerText = "Verifying...";
            status_div.textContent = "";

            const realm_url = KNOWN_REALMS[nickname];
            const valid = await verify_credentials(realm_url, email, api_key);

            if (!valid) {
                status_div.textContent =
                    "Could not connect with these credentials. Please check your email and API key.";
                submit_btn.disabled = false;
                submit_btn.innerText = "Save and Login";
                return;
            }

            const new_realm: RealmConfig = {
                nickname,
                url: realm_url,
                email,
                api_key,
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

// Verify credentials by hitting the /users endpoint. Returns true
// if the server responds successfully.
async function verify_credentials(
    realm_url: string,
    email: string,
    api_key: string,
): Promise<boolean> {
    try {
        const auth = btoa(`${email}:${api_key}`);
        const response = await fetch(`${realm_url}/api/v1/users`, {
            headers: { Authorization: `Basic ${auth}` },
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.result === "success";
    } catch {
        return false;
    }
}

function start_login_process(default_nickname?: string) {
    const login_manager = new LoginManager(default_nickname);
    document.body.append(login_manager.div);
    login_manager.start(default_nickname);
}

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

// Exported for testing.
export {
    get_realm_nickname_from_url,
    verify_credentials,
    KNOWN_REALMS,
    GOPHER_REALMS,
};
