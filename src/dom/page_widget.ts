function add_search_button(add_navigator: () => void): HTMLDivElement {
    const div = document.createElement("div");
    div.style.marginRight = "15px";

    const button = document.createElement("button");
    button.innerText = "+";
    button.style.backgroundColor = "white";
    button.style.padding = "3px";
    button.style.fontSize = "12px";
    button.style.backgroundColor = "white";
    button.style.border = "1px green solid";

    button.addEventListener("click", () => {
        add_navigator();
    });

    div.append(button);

    return div;
}

function tab_bottom_border_spacer(): HTMLDivElement {
    const spacer = document.createElement("div");
    spacer.innerText = " ";
    spacer.style.borderBottom = "1px black solid";
    spacer.style.height = "1px";
    spacer.style.flexGrow = "1";

    return spacer;
}

export function make_button_bar(
    tab_button_divs: HTMLDivElement[],
    add_navigator: () => void,
): HTMLDivElement {
    const button_bar = document.createElement("div");
    button_bar.style.display = "flex";
    button_bar.style.alignItems = "flex-end";
    button_bar.style.paddingTop = "2px";
    button_bar.style.marginBottom = "3px";
    button_bar.style.maxHeight = "fit-content";

    button_bar.append(add_search_button(add_navigator));

    for (const tab_button_div of tab_button_divs) {
        button_bar.append(tab_button_div);
    }

    button_bar.append(tab_bottom_border_spacer());

    return button_bar;
}
