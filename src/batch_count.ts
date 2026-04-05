type AdjusterInfo = {
    min: number;
    max: number;
    value: number;
    callback: (count: number) => void;
};

export function adjuster(info: AdjusterInfo) {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "4px";

    if (info.max <= 5) {
        // Not enough items to bother with an adjuster — return empty div.
        return div;
    }

    let value = info.value;

    function make_button(label: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.innerText = label;
        button.style.color = "white";
        button.style.backgroundColor = "#000080";
        button.style.fontSize = "16px";
        button.style.borderRadius = "5px";
        button.style.padding = "3px 8px";
        button.style.border = "none";
        button.style.cursor = "pointer";
        return button;
    }

    const minus_button = make_button("−");
    const plus_button = make_button("+");

    const count_label = document.createElement("span");
    count_label.style.minWidth = "30px";
    count_label.style.textAlign = "center";

    function update() {
        count_label.innerText = value.toString();
        minus_button.disabled = value <= info.min;
        plus_button.disabled = value >= info.max;
    }

    minus_button.addEventListener("click", (e: Event) => {
        if (value > info.min) {
            value -= 1;
            update();
            info.callback(value);
        }
        e.preventDefault();
        e.stopPropagation();
    });

    plus_button.addEventListener("click", (e: Event) => {
        if (value < info.max) {
            value += 1;
            update();
            info.callback(value);
        }
        e.preventDefault();
        e.stopPropagation();
    });

    update();

    div.append(minus_button, count_label, plus_button);
    return div;
}
