import * as config from "./config";

export function slash_join(s1: string, s2: string): string {
    return `${s1.replace(/\/+$/, "")}/${s2.replace(/^\/+/, "")}`;
}

export function api_url(path: string): URL {
    return new URL(`/api/v1/${path}`, config.get_current_realm_url());
}

// For Gopher-only endpoints that don't exist in the Zulip API.
export function gopher_url(path: string): URL {
    return new URL(`/gopher/${path}`, config.get_current_realm_url());
}

export function get_headers(): Record<string, string> {
    const auth = btoa(
        `${config.get_email_for_current_realm()}:${config.get_api_key_for_current_realm()}`,
    );
    return { Authorization: `Basic ${auth}` };
}

function form_headers(): Record<string, string> {
    return {
        ...get_headers(),
        "Content-Type": "application/x-www-form-urlencoded",
    };
}

const MAX_RETRIES = 3;

export async function with_retry(
    fn: () => Promise<Response>,
): Promise<Response> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const response = await fn();
        if (response.status !== 429) {
            return response;
        }
        const retry_after = response.headers.get("Retry-After");
        const wait_ms = retry_after ? parseFloat(retry_after) * 1000 : 1000;
        console.warn(`Rate limited (429). Retrying in ${wait_ms}ms…`);
        await new Promise<void>((resolve) => setTimeout(resolve, wait_ms));
    }
    return fn();
}

export async function api_get(path: string, params?: Record<string, string>) {
    const url = api_url(path);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    const response = await with_retry(() =>
        fetch(url, { headers: get_headers() }),
    );
    return response.json();
}

export async function api_form_request(
    method: string,
    path: string,
    params: Record<string, string>,
): Promise<{ result: string; msg?: string }> {
    const response = await with_retry(() =>
        fetch(api_url(path), {
            method,
            headers: form_headers(),
            body: new URLSearchParams(params).toString(),
        }),
    );
    return response.json();
}

// For Gopher-only POST endpoints.
export async function gopher_form_request(
    method: string,
    path: string,
    params: Record<string, string>,
): Promise<{ result: string; msg?: string }> {
    const response = await with_retry(() =>
        fetch(gopher_url(path), {
            method,
            headers: form_headers(),
            body: new URLSearchParams(params).toString(),
        }),
    );
    return response.json();
}
