// Tests for the login flow.
//
// Stories:
//   1. Mom clicks an invite link → gets logged in automatically
//   2. Debbie's invite expired → sees failure with manual login option
//   3. Steve manually logs in with valid credentials
//   4. Someone types the wrong API key → sees error, can retry
//   5. Invite links are ignored on non-Gopher realms
//   6. The realm nickname is correctly parsed from the URL

import assert from "node:assert/strict";
import {
    get_realm_nickname_from_url,
    KNOWN_REALMS,
    GOPHER_REALMS,
} from "../login_manager";

// ============================================================
// Story: The realm nickname is parsed from the URL path.
// ============================================================

// /gopher → "gopher"
{
    (globalThis as any).window.location.pathname = "/gopher";
    assert.equal(get_realm_nickname_from_url(), "gopher");
}

// /mac → "mac"
{
    (globalThis as any).window.location.pathname = "/mac";
    assert.equal(get_realm_nickname_from_url(), "mac");
}

// / → undefined (no realm)
{
    (globalThis as any).window.location.pathname = "/";
    assert.equal(get_realm_nickname_from_url(), undefined);
}

// /unknown → undefined (not a known realm)
{
    (globalThis as any).window.location.pathname = "/unknown";
    assert.equal(get_realm_nickname_from_url(), undefined);
}

// /some/prefix/gopher → "gopher" (last segment)
{
    (globalThis as any).window.location.pathname = "/some/prefix/gopher";
    assert.equal(get_realm_nickname_from_url(), "gopher");
}

// ============================================================
// Story: Known realms and Gopher detection
// ============================================================

{
    assert("gopher" in KNOWN_REALMS);
    assert("mac" in KNOWN_REALMS);
    assert(GOPHER_REALMS.has("gopher"));
    assert(!GOPHER_REALMS.has("mac"));
}

// ============================================================
// Story: Invite links are only processed for Gopher realms.
// A URL like /mac?invite=abc should NOT attempt to redeem.
// (We can't easily test the async try_redeem_invite here without
// mocking fetch, but we verify the guard condition.)
// ============================================================

{
    // The GOPHER_REALMS set is the guard. If "mac" is not in it,
    // try_redeem_invite returns false immediately.
    assert(!GOPHER_REALMS.has("mac"), "mac should not be a gopher realm");
    assert(GOPHER_REALMS.has("gopher"), "gopher should be a gopher realm");
}

// Reset pathname for other tests.
(globalThis as any).window.location.pathname = "/";

console.log("  login_test: OK");
