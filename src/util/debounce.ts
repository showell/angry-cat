// Returns a debounced version of the given function that delays
// execution until `delay_ms` milliseconds have passed since the
// last call. If called again before the delay expires, the timer
// resets. Useful for things like saving after keystrokes.

export function debounce(fn: () => void, delay_ms: number): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return () => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = undefined;
            fn();
        }, delay_ms);
    };
}
