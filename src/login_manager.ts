import * as config from "./backend/config";

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

    start(): void {
        this.content_div.innerHTML = "";
        this.render_login_form();
    }

    private render_login_form(): void {
        this.content_div.innerHTML = "";

        const form = document.createElement("form");
        form.style.gap = "8px";

        const email_info = this.create_input_box("email", "Email Address");
        const api_key_info = this.create_input_box("password", "API Key");

        const submit_btn = document.createElement("button");
        submit_btn.type = "submit";
        submit_btn.innerText = "Save and Login";

        form.append(email_info.div, api_key_info.div, submit_btn);

        form.onsubmit = (e) => {
            // Prevent page reload
            e.preventDefault();
            const new_realm = {
                nickname: "mac",
                url: "https://macandcheese.zulipchat.com/",
                email: email_info.input.value,
                api_key: api_key_info.input.value,
            };

            config.store_realm_config(new_realm);
            window.location.replace(import.meta.env.BASE_URL + "mac");
        };

        this.content_div.append(form);
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

function start_login_process() {
    const login_manager = new LoginManager();
    document.body.append(login_manager.div);
    login_manager.start();
}

export function needs_to_login(): boolean {
    // We only support logging into macandcheese (mac) for now.
    const mac_config = config.get_realm_config("mac");
    if (mac_config === undefined) {
        start_login_process();
        return true;
    }
    config.set_current_realm_config(mac_config);
    return false;
}
