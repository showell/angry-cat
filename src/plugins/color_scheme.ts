import * as colors from "../colors";
import type { Plugin, PluginContext } from "../plugin_helper";

type SwatchEntry = {
    name: string;
    value: string;
    description: string;
    is_text_color?: boolean;
    demo_bg?: string; // background to show text-color entries against, when not white
};

type SwatchGroup = {
    heading: string;
    entries: SwatchEntry[];
};

const GROUPS: SwatchGroup[] = [
    {
        heading: "Primary brand",
        entries: [
            {
                name: "primary",
                value: colors.primary,
                description: "Buttons, headings, labels, accent borders",
                is_text_color: true,
            },
            {
                name: "on_primary",
                value: colors.on_primary,
                description: "Text on primary-colored surfaces (button labels)",
                is_text_color: true,
                demo_bg: colors.primary,
            },
            {
                name: "primary_focus",
                value: colors.primary_focus,
                description: "Keyboard-focus highlight on primary buttons",
            },
        ],
    },
    {
        heading: "Surface / layout",
        entries: [
            {
                name: "surface",
                value: colors.surface,
                description: "Pane backgrounds, sticky table headers",
            },
            {
                name: "accent_border",
                value: colors.accent_border,
                description: "Pane borders, participant left-accent lines",
            },
        ],
    },
    {
        heading: "Tab bar",
        entries: [
            {
                name: "tab_inactive_bg",
                value: colors.tab_inactive_bg,
                description:
                    "Background of background tabs (active tabs use surface)",
            },
        ],
    },
    {
        heading: "Semantic feedback",
        entries: [
            {
                name: "danger",
                value: colors.danger,
                description: "Destructive actions (close button, error status)",
                is_text_color: true,
            },
            {
                name: "success",
                value: colors.success,
                description:
                    "Positive feedback (celebrate status, compose headings)",
                is_text_color: true,
            },
            {
                name: "status_info",
                value: colors.status_info,
                description: "Informational status bar messages",
                is_text_color: true,
            },
        ],
    },
    {
        heading: "Text hierarchy",
        entries: [
            {
                name: "text_body",
                value: colors.text_body,
                description: "Standard body text",
                is_text_color: true,
            },
            {
                name: "text_muted",
                value: colors.text_muted,
                description: "De-emphasized text (edit buttons, etc.) and cancel button bg",
                is_text_color: true,
            },
        ],
    },
    {
        heading: "Borders and separators",
        entries: [
            {
                name: "border",
                value: colors.border,
                description: "Heading underlines, tab bar spacer",
            },
            {
                name: "border_subtle",
                value: colors.border_subtle,
                description: "Light separator lines between items",
            },
        ],
    },
    {
        heading: "Selection and presence",
        entries: [
            {
                name: "selected_bg",
                value: colors.selected_bg,
                description: "Selected channel or topic row background",
            },
            {
                name: "unread_bg",
                value: colors.unread_bg,
                description: "Unread message background and badge",
            },
            {
                name: "new_message_border",
                value: colors.new_message_border,
                description: "Border on a newly-arrived message",
            },
        ],
    },
];

function render_swatch(entry: SwatchEntry): HTMLDivElement {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.marginBottom = "6px";

    const swatch = document.createElement("div");
    swatch.style.width = "36px";
    swatch.style.height = "22px";
    swatch.style.flexShrink = "0";
    swatch.style.backgroundColor = entry.value;
    swatch.style.border = "1px solid #999";
    swatch.style.borderRadius = "3px";
    row.append(swatch);

    const name_span = document.createElement("span");
    name_span.innerText = entry.name;
    name_span.style.fontFamily = "monospace";
    name_span.style.fontSize = "13px";
    name_span.style.color = colors.primary;
    name_span.style.minWidth = "160px";
    row.append(name_span);

    const value_span = document.createElement("span");
    value_span.innerText = entry.value;
    value_span.style.fontFamily = "monospace";
    value_span.style.fontSize = "12px";
    value_span.style.color = colors.text_muted;
    value_span.style.minWidth = "90px";
    row.append(value_span);

    const desc_span = document.createElement("span");
    desc_span.innerText = entry.description;
    desc_span.style.fontSize = "13px";
    desc_span.style.color = entry.is_text_color
        ? entry.value
        : colors.text_body;
    if (entry.demo_bg) {
        desc_span.style.backgroundColor = entry.demo_bg;
        desc_span.style.padding = "1px 5px";
        desc_span.style.borderRadius = "3px";
    }
    row.append(desc_span);

    return row;
}

function render_group(group: SwatchGroup): HTMLDivElement {
    const div = document.createElement("div");
    div.style.marginBottom = "18px";

    const heading = document.createElement("div");
    heading.innerText = group.heading;
    heading.style.fontWeight = "bold";
    heading.style.fontSize = "13px";
    heading.style.color = colors.primary;
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.06em";
    heading.style.marginBottom = "8px";
    heading.style.paddingBottom = "4px";
    heading.style.borderBottom = `1px solid ${colors.accent_border}`;
    div.append(heading);

    for (const entry of group.entries) {
        div.append(render_swatch(entry));
    }

    return div;
}

function render_compound_examples(): HTMLDivElement {
    const div = document.createElement("div");
    div.style.marginBottom = "18px";

    const heading = document.createElement("div");
    heading.innerText = "Compound examples";
    heading.style.fontWeight = "bold";
    heading.style.fontSize = "13px";
    heading.style.color = colors.primary;
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.06em";
    heading.style.marginBottom = "10px";
    heading.style.paddingBottom = "4px";
    heading.style.borderBottom = `1px solid ${colors.accent_border}`;
    div.append(heading);

    const examples_row = document.createElement("div");
    examples_row.style.display = "flex";
    examples_row.style.gap = "16px";
    examples_row.style.flexWrap = "wrap";
    examples_row.style.alignItems = "flex-start";

    // Primary button
    {
        const btn = document.createElement("button");
        btn.innerText = "Primary button";
        btn.style.color = colors.on_primary;
        btn.style.backgroundColor = colors.primary;
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.padding = "5px 12px";
        btn.style.fontSize = "14px";
        btn.style.cursor = "default";
        examples_row.append(btn);
    }

    // Cancel button
    {
        const btn = document.createElement("button");
        btn.innerText = "Cancel button";
        btn.style.color = colors.on_primary;
        btn.style.backgroundColor = colors.text_muted;
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.padding = "5px 12px";
        btn.style.fontSize = "14px";
        btn.style.cursor = "default";
        examples_row.append(btn);
    }

    // Danger (close) button
    {
        const btn = document.createElement("button");
        btn.innerText = "close";
        btn.style.color = colors.on_primary;
        btn.style.backgroundColor = colors.danger;
        btn.style.border = "none";
        btn.style.borderRadius = "5px";
        btn.style.padding = "5px 12px";
        btn.style.fontSize = "14px";
        btn.style.cursor = "default";
        examples_row.append(btn);
    }

    // Active tab
    {
        const tab = document.createElement("div");
        tab.innerText = "Active tab";
        tab.style.backgroundColor = colors.surface;
        tab.style.color = colors.primary;
        tab.style.borderBottom = `2px solid ${colors.surface}`;
        tab.style.border = `1px solid ${colors.border}`;
        tab.style.borderBottomColor = colors.surface;
        tab.style.padding = "4px 10px";
        tab.style.fontSize = "13px";
        tab.style.cursor = "default";
        examples_row.append(tab);
    }

    // Inactive tab
    {
        const tab = document.createElement("div");
        tab.innerText = "Inactive tab";
        tab.style.backgroundColor = colors.tab_inactive_bg;
        tab.style.color = colors.primary;
        tab.style.border = `1px solid ${colors.border}`;
        tab.style.padding = "4px 10px";
        tab.style.fontSize = "13px";
        tab.style.cursor = "default";
        examples_row.append(tab);
    }

    // Status bar examples
    {
        const bar = document.createElement("div");
        bar.style.display = "flex";
        bar.style.flexDirection = "column";
        bar.style.gap = "2px";
        bar.style.fontSize = "13px";

        const scold = document.createElement("div");
        scold.innerText = "scold: something went wrong";
        scold.style.color = colors.danger;
        bar.append(scold);

        const celebrate = document.createElement("div");
        celebrate.innerText = "celebrate: message sent!";
        celebrate.style.color = colors.success;
        bar.append(celebrate);

        const inform = document.createElement("div");
        inform.innerText = "inform: click a channel to begin";
        inform.style.color = colors.status_info;
        bar.append(inform);

        examples_row.append(bar);
    }

    // Unread row
    {
        const row = document.createElement("div");
        row.style.backgroundColor = colors.unread_bg;
        row.style.border = `1px dotted ${colors.primary}`;
        row.style.padding = "4px 8px";
        row.style.fontSize = "13px";
        row.style.color = colors.text_body;
        row.innerText = "Unread message row";
        examples_row.append(row);
    }

    // Selected row
    {
        const row = document.createElement("div");
        row.style.backgroundColor = colors.selected_bg;
        row.style.padding = "4px 8px";
        row.style.fontSize = "13px";
        row.style.color = colors.primary;
        row.innerText = "> Selected topic";
        examples_row.append(row);
    }

    div.append(examples_row);
    return div;
}

export function plugin(context: PluginContext): Plugin {
    const div = document.createElement("div");
    div.style.padding = "16px";
    div.style.overflowY = "auto";
    div.style.height = "100%";
    div.style.boxSizing = "border-box";

    const title = document.createElement("div");
    title.innerText = "Color Scheme";
    title.style.fontSize = "20px";
    title.style.fontWeight = "bold";
    title.style.color = colors.primary;
    title.style.marginBottom = "4px";
    div.append(title);

    const subtitle = document.createElement("div");
    subtitle.innerText =
        "All color constants are defined in src/colors.ts. Change a value there to retheme the app.";
    subtitle.style.fontSize = "13px";
    subtitle.style.color = colors.text_muted;
    subtitle.style.marginBottom = "20px";
    div.append(subtitle);

    div.append(render_compound_examples());

    for (const group of GROUPS) {
        div.append(render_group(group));
    }

    context.update_label("Color Scheme");

    return { div };
}
