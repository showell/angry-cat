// GitHub integration setup plugin.
//
// Manages github_repos via GET/POST/DELETE /gopher/github/repos.
// Each repo maps to a channel and optional default topic. The plugin
// shows the webhook URL to copy into GitHub's settings.

import {
    api_url,
    get_headers,
    gopher_url,
    gopher_form_request,
} from "../backend/api_helpers";
import { Button } from "../button";
import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";
import { StatusBar } from "../status_bar";

type RepoInfo = {
    id: number;
    owner: string;
    name: string;
    channel_id: number;
    channel_name: string;
    default_topic: string;
};

type ChannelInfo = {
    channel_id: number;
    name: string;
};

export function plugin(context: PluginContext): Plugin {
    context.update_label("GitHub");

    const div = document.createElement("div");
    div.style.paddingTop = "15px";
    div.style.maxWidth = "500px";

    const heading = document.createElement("div");
    heading.innerText = "GitHub Integration";
    heading.style.fontSize = "18px";
    heading.style.fontWeight = "bold";
    heading.style.color = colors.primary;
    heading.style.marginBottom = "12px";
    div.append(heading);

    const content_div = document.createElement("div");
    div.append(content_div);

    // We need channels for the add-repo form and the admin's API key
    // for building webhook URLs.
    let all_channels: ChannelInfo[] = [];
    let admin_api_key = "";

    async function load(): Promise<void> {
        content_div.innerHTML = "";
        const loading = document.createElement("div");
        loading.innerText = "Loading...";
        loading.style.color = colors.text_muted;
        content_div.append(loading);

        try {
            // Fetch repos, channels, and API key in parallel.
            const [repos_resp, channels_resp] = await Promise.all([
                fetch(gopher_url("github/repos"), { headers: get_headers() }),
                fetch(api_url("users/me/subscriptions"), {
                    headers: get_headers(),
                }),
            ]);
            const repos_data = await repos_resp.json();
            const channels_data = await channels_resp.json();

            if (
                repos_data.result !== "success" ||
                channels_data.result !== "success"
            ) {
                throw new Error("Failed to load data");
            }

            all_channels = (
                channels_data.subscriptions as {
                    stream_id: number;
                    name: string;
                }[]
            ).map((s) => ({
                channel_id: s.stream_id,
                name: s.name,
            }));

            // Get the admin's API key from the auth header we're already sending.
            // It's in the Basic auth — decode it.
            const auth_header = get_headers()["Authorization"];
            const decoded = atob(auth_header.replace("Basic ", ""));
            admin_api_key = decoded.split(":")[1];

            content_div.innerHTML = "";
            render(repos_data.repos as RepoInfo[] | null);
        } catch {
            content_div.innerHTML = "";
            const err = document.createElement("div");
            err.innerText =
                "Failed to load GitHub setup. Is the server running?";
            err.style.color = "red";
            content_div.append(err);
        }
    }

    function webhook_url(repo_id: number): string {
        const base = gopher_url("webhooks/github");
        base.searchParams.set("repo_id", String(repo_id));
        base.searchParams.set("api_key", admin_api_key);
        return base.toString();
    }

    function render(repos: RepoInfo[] | null): void {
        // Existing repos.
        if (repos && repos.length > 0) {
            const section = document.createElement("div");
            section.style.marginBottom = "16px";

            const label = document.createElement("div");
            label.innerText = "Configured repos";
            label.style.fontWeight = "bold";
            label.style.marginBottom = "8px";
            section.append(label);

            for (const repo of repos) {
                section.append(render_repo(repo));
            }
            content_div.append(section);
        }

        // Add repo form.
        content_div.append(render_add_form());
    }

    function render_repo(repo: RepoInfo): HTMLDivElement {
        const row = document.createElement("div");
        row.style.border = `1px solid ${colors.border_subtle}`;
        row.style.borderRadius = "4px";
        row.style.padding = "10px";
        row.style.marginBottom = "8px";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "6px";

        const name_span = document.createElement("b");
        name_span.innerText = `${repo.owner}/${repo.name}`;
        header.append(name_span);

        const remove_btn = new Button("Remove", 80, async () => {
            remove_btn.disable();
            const data = await gopher_form_request("DELETE", "github/repos", {
                id: String(repo.id),
            });
            if (data.result === "success") {
                StatusBar.celebrate(`Removed ${repo.owner}/${repo.name}`);
                load();
            } else {
                StatusBar.scold("Failed to remove repo");
                remove_btn.enable();
            }
        });
        header.append(remove_btn.div);
        row.append(header);

        const info = document.createElement("div");
        info.style.fontSize = "13px";
        info.style.color = colors.text_muted;
        info.style.marginBottom = "6px";
        info.innerText = `Channel: #${repo.channel_name}`;
        if (repo.default_topic) {
            info.innerText += ` · Topic: ${repo.default_topic}`;
        }
        row.append(info);

        const url_input = document.createElement("input");
        url_input.type = "text";
        url_input.value = webhook_url(repo.id);
        url_input.readOnly = true;
        url_input.style.width = "100%";
        url_input.style.padding = "4px";
        url_input.style.fontFamily = "monospace";
        url_input.style.fontSize = "12px";
        url_input.style.boxSizing = "border-box";
        url_input.style.marginBottom = "6px";
        row.append(url_input);

        const copy_btn = new Button("Copy webhook URL", 140, () => {
            url_input.select();
            navigator.clipboard.writeText(url_input.value).then(() => {
                StatusBar.celebrate(
                    `Webhook URL for ${repo.owner}/${repo.name} copied!`,
                );
            });
        });
        row.append(copy_btn.div);

        return row;
    }

    function render_add_form(): HTMLDivElement {
        const form = document.createElement("div");
        form.style.border = `1px solid ${colors.border_subtle}`;
        form.style.borderRadius = "4px";
        form.style.padding = "10px";

        const label = document.createElement("div");
        label.innerText = "Add a repository";
        label.style.fontWeight = "bold";
        label.style.marginBottom = "8px";
        form.append(label);

        const instructions = document.createElement("div");
        instructions.style.fontSize = "13px";
        instructions.style.color = colors.text_muted;
        instructions.style.marginBottom = "8px";
        instructions.innerText =
            'Enter owner/name (e.g. "showell" and "angry-gopher"), pick a channel, ' +
            "and optionally set a default topic. Then copy the webhook URL into " +
            "GitHub under Settings → Webhooks → Add webhook.";
        form.append(instructions);

        const owner_input = make_input("Owner (e.g. showell)");
        const name_input = make_input("Repo name (e.g. angry-gopher)");
        form.append(make_label("Owner"), owner_input);
        form.append(make_label("Repo name"), name_input);

        form.append(make_label("Channel"));
        const channel_select = document.createElement("select");
        channel_select.style.marginBottom = "8px";
        channel_select.style.display = "block";
        for (const ch of all_channels) {
            const opt = document.createElement("option");
            opt.value = String(ch.channel_id);
            opt.innerText = `#${ch.name}`;
            channel_select.append(opt);
        }
        form.append(channel_select);

        const topic_input = make_input("(optional) e.g. upstream");
        form.append(make_label("Default topic"), topic_input);

        const add_btn = new Button("Add repo", 100, async () => {
            const owner = owner_input.value.trim();
            const name = name_input.value.trim();
            if (!owner || !name) {
                StatusBar.scold("Owner and repo name are required");
                return;
            }
            add_btn.disable();
            const data = await gopher_form_request("POST", "github/repos", {
                owner,
                name,
                channel_id: channel_select.value,
                default_topic: topic_input.value.trim(),
            });
            if (data.result === "success") {
                StatusBar.celebrate(`Added ${owner}/${name}`);
                load();
            } else {
                StatusBar.scold(
                    `Failed to add repo: ${(data as { msg?: string }).msg ?? "unknown error"}`,
                );
                add_btn.enable();
            }
        });
        form.append(add_btn.div);

        return form;
    }

    function make_label(text: string): HTMLLabelElement {
        const label = document.createElement("label");
        label.innerText = text;
        label.style.fontWeight = "bold";
        label.style.display = "block";
        label.style.marginTop = "8px";
        label.style.marginBottom = "4px";
        label.style.fontSize = "13px";
        return label;
    }

    function make_input(placeholder: string): HTMLInputElement {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = placeholder;
        input.style.width = "300px";
        input.style.padding = "4px";
        input.style.marginBottom = "4px";
        input.style.display = "block";
        return input;
    }

    load();

    return { div };
}
