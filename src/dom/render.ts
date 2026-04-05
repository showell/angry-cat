import * as colors from "../colors";

export function render_list_heading(name: string): HTMLElement {
    const div = document.createElement("div");

    const text_div = document.createElement("div");
    text_div.innerText = name;
    text_div.style.display = "inline-block";
    text_div.style.paddingBottom = "4px";
    text_div.style.marginBottom = "12px";
    text_div.style.fontSize = "19px";
    text_div.style.borderBottom = `1px solid ${colors.border}`;

    div.append(text_div);

    return div;
}

export function render_thead(headers: HTMLElement[]): HTMLTableSectionElement {
    const thead = document.createElement("thead");

    const tr = document.createElement("tr");
    for (const th of headers) {
        tr.append(th);
    }
    thead.append(tr);

    return thead;
}

export function render_th(label: string): HTMLElement {
    const th = document.createElement("th");
    th.innerText = label;
    th.style.position = "sticky";
    th.style.top = "0";
    th.style.backgroundColor = colors.surface;
    th.style.zIndex = "999";
    th.style.textAlign = "left";
    th.style.fontWeight = "bold";
    th.style.color = colors.text_heading;
    th.style.margin = "2px";
    return th;
}

export function render_tr(divs: HTMLElement[]): HTMLElement {
    const tr = document.createElement("tr");

    for (const div of divs) {
        const td = document.createElement("td");
        td.style.verticalAlign = "top";
        td.style.padding = "4px";
        td.append(div);
        tr.append(td);
    }

    return tr;
}

export function render_unread_count(count: number): HTMLDivElement {
    const div = document.createElement("div");
    div.innerText = count ? `${count}` : "";
    div.style.textAlign = "right";
    div.style.padding = "2px";

    if (count > 0) {
        div.style.backgroundColor = colors.unread_bg;
    }

    return div;
}
