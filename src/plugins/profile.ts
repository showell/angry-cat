// Profile plugin: lets the authenticated user view and edit
// their own settings (currently just full_name). Mirrors the
// shape of Zulip's PATCH /api/v1/settings endpoint via the
// thin update_full_name() helper in zulip_client.ts.
//
// This is a deliberately tiny plugin to scaffold the broader
// "implement the Zulip API on both sides" effort. More fields
// (timezone, email, password, etc.) will be added as the
// corresponding endpoints are implemented on Angry Gopher.

import { DB } from "../backend/database";
import { Button } from "../button";
import * as colors from "../colors";
import * as model from "../backend/model";
import { update_full_name } from "../backend/zulip_client";
import type { Plugin, PluginContext } from "../plugin_helper";

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");
    div.style.padding = "16px";
    div.style.boxSizing = "border-box";

    const title = document.createElement("div");
    title.innerText = "Profile";
    title.style.fontSize = "20px";
    title.style.fontWeight = "bold";
    title.style.color = colors.primary;
    title.style.marginBottom = "4px";
    div.append(title);

    const subtitle = document.createElement("div");
    subtitle.innerText =
        "Edit your account settings. Saves go directly to the server.";
    subtitle.style.fontSize = "13px";
    subtitle.style.color = colors.text_muted;
    subtitle.style.marginBottom = "20px";
    div.append(subtitle);

    div.append(render_full_name_section());

    context.update_label("Profile");
    return { div };
}

// --- Full-name editor ---

function render_full_name_section(): HTMLElement {
    const section = document.createElement("div");
    section.style.maxWidth = "400px";
    section.style.marginBottom = "24px";

    const heading = document.createElement("div");
    heading.innerText = "Display name";
    heading.style.fontSize = "13px";
    heading.style.fontWeight = "bold";
    heading.style.color = colors.primary;
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.06em";
    heading.style.marginBottom = "8px";
    heading.style.paddingBottom = "4px";
    heading.style.borderBottom = `1px solid ${colors.accent_border}`;
    section.append(heading);

    const input = document.createElement("input");
    input.type = "text";
    input.value = model.current_user_name();
    input.style.width = "100%";
    input.style.padding = "6px 8px";
    input.style.fontSize = "14px";
    input.style.boxSizing = "border-box";
    input.style.marginBottom = "10px";
    section.append(input);

    const button_row = document.createElement("div");
    button_row.style.display = "flex";
    button_row.style.gap = "12px";
    button_row.style.alignItems = "center";

    const save_button = new Button("Save", 100, () => save());
    button_row.append(save_button.div);

    // Inline status message — populated by save() with success
    // or failure feedback. Stays visible until the next save.
    const status_span = document.createElement("span");
    status_span.style.fontSize = "13px";
    button_row.append(status_span);

    section.append(button_row);

    // Enter in the input triggers save (replaces the <form>
    // wrapper we had before — Button's preventDefault conflicts
    // with form submission, so we handle Enter explicitly).
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            save();
        }
    });

    function set_status(text: string, color: string): void {
        status_span.textContent = text;
        status_span.style.color = color;
    }

    function save(): void {
        const new_name = input.value.trim();
        if (new_name === "") {
            set_status("Display name cannot be empty.", colors.danger);
            return;
        }
        if (new_name === model.current_user_name()) {
            set_status("(no change)", colors.text_muted);
            return;
        }

        save_button.disable();
        set_status("Saving…", colors.text_muted);

        update_full_name(
            new_name,
            () => {
                // Update the local user-map cache for immediate
                // local effect. The realm_user event will also
                // update it (a harmless no-op if it arrives after
                // this), and that same event updates OTHER clients.
                const me = DB.user_map.get(DB.current_user_id);
                if (me) {
                    me.full_name = new_name;
                }
                input.value = new_name;
                save_button.enable();
                set_status("Saved!", colors.success);
            },
            (error_msg) => {
                save_button.enable();
                set_status(`Error: ${error_msg}`, colors.danger);
            },
        );
    }


    return section;
}
