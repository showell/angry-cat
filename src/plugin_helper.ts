import type { ZulipEvent } from "./backend/event";

export type Plugin = {
    div: HTMLDivElement;
    handle_zulip_event?: (event: ZulipEvent) => void;
    handle_keyboard_shortcut?: (key: string) => boolean;
};

export type PluginContext = {
    update_label: (label: string) => void;
    request_close: () => void;
    highlight_tab: () => void;
    reset_tab_highlight: () => void;
    tab_count: () => number;
};

export type PluginFactory = (context: PluginContext) => Plugin;
