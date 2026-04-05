type AdjusterInfo = {
    min: number;
    max: number;
    value: number;
    callback: (count: number) => void;
};

export function adjuster(info: AdjusterInfo) {
    const div = document.createElement("div");
    div.style.display = "flex";

    if (info.max <= 5) {
        // Not enough items to bother with a slider — return empty div.
        return div;
    }

    const range = document.createElement("input");
    range.type = "range";
    range.min = info.min.toString();
    range.max = info.max.toString();
    range.value = info.value.toString();

    range.oninput = () => {
        info.callback(parseInt(range.value));
    };

    div.append(range);
    return div;
}
