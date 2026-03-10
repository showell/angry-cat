/*

    https://webxdc.org/docs/get_started.html
    https://webxdc.org/docs/spec/sendUpdate.html

    The webxdc project "brings mini apps to messenger chats".

    We try to mostly emulate their API for certain integrations.
    Lyn Rummy is the first example.

    There is no goal to be 100% compliant with webxdc, and we
    only implement the subset that we need for Lyn Rummy as
    I write this (March 2026).  But I try to make it easy to
    understand for anybody who wanted to take the concept further
    by using their method names as inspiration.

*/

export type Update = {
    payload: object;
};

export type WebXdc = {
    // we don't even bother with the deprecated descr field here
    sendUpdate: (update: Update) => void;
};
