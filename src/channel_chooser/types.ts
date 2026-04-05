import type { ChannelRow } from "../channel_row";

export type ChannelChooserOpts = {
    start_channel_id: number | undefined;
    handle_channel_chosen: (channel_id: number) => void;
    handle_channel_cleared: () => void;
};

export type ChannelChooser = {
    div: HTMLDivElement;
    refresh_completely: () => void;
    get_channel_row: () => ChannelRow;
    total_unread_count: () => number;
};
