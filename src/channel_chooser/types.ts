import type { ChannelRow } from "../backend/channel_row";

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
    get_first_channel_id: () => number | undefined;
    get_adjacent_channel_id: (
        current_channel_id: number,
        direction: 1 | -1,
    ) => number | undefined;
    get_first_unread_channel_id: () => number | undefined;
    select_channel: (channel_id: number) => void;
    deselect: () => void;
};
