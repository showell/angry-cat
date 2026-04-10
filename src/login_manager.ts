import * as config from "./backend/config";
import type { RealmConfig } from "./backend/config";
import { Button } from "./button";

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
        const api_key_info = this.create_input_box("text", "API Key");

        const status_div = document.createElement("div");
        status_div.style.color = "#c00";
        status_div.style.fontSize = "14px";
        status_div.style.marginTop = "8px";

        const submit_btn = new Button("Save and Login", 180, () => {
            form.requestSubmit();
        });

        form.append(
            realm_info.div,
            email_info.div,
            api_key_info.div,
            submit_btn.div,
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
            submit_btn.disable();
            status_div.textContent = "";

            const realm_url = KNOWN_REALMS[nickname];
            const result = await verify_credentials(realm_url, email, api_key);

            if (result.kind !== "success") {
                status_div.textContent = explain_verify_failure(realm_url, result);
                submit_btn.enable();
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

// Result of trying to verify credentials. The variants let the
// caller distinguish "the server isn't even reachable" from
// "the server is up but said the credentials are wrong" — those
// are very different problems and the user should be told which
// one they're hitting.
export type VerifyResult =
    | { kind: "success" }
    | { kind: "unreachable"; detail: string }
    | { kind: "auth_failed" }
    | { kind: "server_error"; detail: string };

// Convert a non-success VerifyResult into a user-facing message
// that points the user at the actual problem instead of always
// blaming their credentials.
export function explain_verify_failure(
    realm_url: string,
    result: VerifyResult,
): string {
    switch (result.kind) {
        case "success":
            return "";
        case "unreachable":
            return (
                `Could not reach ${realm_url}. Is the server running ` +
                `and listening on that port? (${result.detail})`
            );
        case "auth_failed":
            return (
                "The server is up, but rejected your email and API key. " +
                "Please double-check both."
            );
        case "server_error":
            return `Server returned an error: ${result.detail}`;
    }
}

// Verify credentials by hitting the /users endpoint. The four
// possible outcomes are reported as distinct discriminated-union
// variants so the login form can show a precise error message.
async function verify_credentials(
    realm_url: string,
    email: string,
    api_key: string,
): Promise<VerifyResult> {
    let response: Response;
    try {
        const auth = btoa(`${email}:${api_key}`);
        response = await fetch(`${realm_url}/api/v1/users`, {
            headers: { Authorization: `Basic ${auth}` },
        });
    } catch (err) {
        // fetch() throws on network failures: server unreachable,
        // DNS failure, port not listening, CORS preflight death,
        // certificate problems. We can't distinguish these from
        // each other in the browser, but we can at least tell the
        // user "I never got a response from the server."
        return { kind: "unreachable", detail: String(err) };
    }

    if (response.status === 401 || response.status === 403) {
        return { kind: "auth_failed" };
    }

    if (!response.ok) {
        return {
            kind: "server_error",
            detail: `HTTP ${response.status} ${response.statusText}`,
        };
    }

    try {
        const data = await response.json();
        if (data.result === "success") {
            return { kind: "success" };
        }
        // The server answered 200 OK but the body says result=error.
        // The server's own message (if any) is the most useful thing
        // we can show; fall back to "auth_failed" if it's missing.
        if (typeof data.msg === "string" && data.msg) {
            return { kind: "server_error", detail: data.msg };
        }
        return { kind: "auth_failed" };
    } catch (err) {
        return {
            kind: "server_error",
            detail: `Could not parse response: ${String(err)}`,
        };
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
