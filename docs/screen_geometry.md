# Screen Geometry

## Overview

Layout is done entirely with inline styles in TypeScript — no layout CSS.
The two CSS files (`app_variables.css`, `rendered_markdown.css`) only supply
color variables and rendered-markdown typography; neither affects geometry.

The page never scrolls. The body is fixed at `100vh` with `overflow: hidden`,
and a **flex-column cascade** subdivides that height top-down so that every
level knows exactly how tall it is. Scrolling happens only inside individual
pane content areas.

---

## Height cascade (top-down)

```
body                        margin: 0
└── page_div  (Page.div)    height: 100vh, flex column, overflow: hidden
      ├── navbar_div         natural height (~50–60px)
      └── container_div      flex: 1, min-height: 0, overflow: hidden
            └── PluginHelper.div   height: 100%  (one visible at a time)
                  └── Navigator.div   flex column, height: 100%
                        ├── ButtonPanel.div   natural height (~65px)
                        └── PaneManager.div   flex: 1, min-height: 0
                              └── [panes...]  height: 100% via stretch
```

Each level takes its natural height and gives the remainder to the next
level via `flex: 1` + `min-height: 0`. The `min-height: 0` override is
required at every flex child that participates in scrolling — without it,
the browser's default `min-height: auto` prevents the element from shrinking
to enable `overflow: hidden/auto`.

---

## Page level

**`body`**: `margin: 0` (reset in Page constructor to eliminate browser default 8px margin)

**`page_div`** (Page.div, assembled by `layout.draw_page`):
- `height: 100vh`
- `display: flex; flex-direction: column`
- `overflow: hidden` — prevents any outer-page scrollbar
- `marginLeft: 8px` — visual indent from left edge

**`navbar_div`** (assembled by `layout.make_navbar`):
- Contains StatusBar (one line of text) and button_bar (tab buttons)
- Natural height, no flex-grow
- `marginTop: 8px` for visual breathing room

**`container_div`**:
- `flex: 1; min-height: 0; overflow: hidden`
- Fills all remaining height below the navbar
- Holds one PluginHelper at a time (others are `display: none`)

---

## Plugin layer

**`PluginHelper.div`**:
- `height: 100%; overflow: hidden`
- Only the active plugin has `display: block`; rest are `display: none`

Non-Navigator plugins (Recent Conversations, Reading List, etc.) render at
their natural content height inside this 100%-height container. They do not
currently fill the available height — that is acceptable for now since they
are panel-style views, not list views.

---

## Navigator

**`Navigator.div`**:
- `display: flex; flex-direction: column; height: 100%`

**`ButtonPanel.div`**:
- `display: flex; maxHeight: fit-content`
- `marginTop: 11px; marginBottom: 14px`
- Takes its natural height (~65px total); does not flex-grow

**`PaneManager.div`**:
- `display: flex` (horizontal row)
- `flex: 1; min-height: 0` — fills all Navigator height below the button panel
- `overflow-x: auto` — allows horizontal scroll if panes exceed viewport width

---

## Panes

Panes are children of the PaneManager flex row. There are two categories:

### Stretching panes (fill full PaneManager height)

These rely on PaneManager's default `align-items: stretch`. They are built
via `draw_table_pane` or `draw_list_pane` in `layout.ts`, both of which
call `layout_pane_div` and then `layout_main_pane_div` on their inner
content area.

**`layout_pane_div`** (applied to the outer pane div):
- `display: flex; flex-direction: column`
- `backgroundColor: white; borderRadius: 8px; border: 1px #CCCCFF solid`
- `padding: 10px 13px; marginRight: 12px`
- No fixed height — stretches to PaneManager's height via `align-items: stretch`

**`layout_main_pane_div`** (applied to the inner scrollable content div):
- `flex: 1; min-height: 0` — fills remaining pane height below the header
- `overflowY: auto` — the only scroll region for list content
- `paddingRight: 5px`

**`draw_table_pane`** structure (used by channel chooser, topic list):
```
pane_div  (flex column, full PaneManager height)
  ├── heading div           natural height
  ├── adjuster_div          natural height
  └── main_div              flex: 1, min-height: 0, overflow-y: auto
        └── table_div       (e.g. TopicList rows)
```

**`draw_list_pane`** structure (used by message pane):
```
pane_div  (flex column, full PaneManager height)
  ├── header_div            natural height  (MessageViewHeader)
  └── list_div              flex: 1, min-height: 0, overflow-y: auto
                            (MessageList.div)
```

### Natural-height panes (align-self: flex-start)

These use `layout_pane_div` but override the stretch with `align-self: flex-start`,
so they take only as much height as their content needs.

**ChannelInfo**: description, traffic stats, and participant list.

**ReplyPane**: the compose box (topic input + textarea + send button).

---

## Navigator pane sequence

Panes accumulate left-to-right in PaneManager as the user navigates deeper:

| Step | Key | Class | Height behavior |
|---|---|---|---|
| Always | `channel_chooser` | draw_table_pane | stretch |
| Channel chosen | `topic_pane` | draw_table_pane | stretch |
| Channel chosen | `channel_info` | ChannelInfo | flex-start |
| Topic selected | `message_pane` | draw_list_pane | stretch |
| Reply clicked | `reply_pane` | ReplyPane | flex-start |

`PaneManager.remove_after("channel_chooser")` clears panes 2–5 when the
user changes channels. The channel_chooser pane is always present.

---

## Summary: where scrolling happens

There is exactly one scroll mechanism for list content: `layout_main_pane_div`
(inside any pane built with `draw_table_pane` or `draw_list_pane`). Its height
is determined by the flex cascade — not a magic number — and it scrolls
vertically with `overflow-y: auto`.

Horizontal overflow of the pane row (too many panes for the viewport width)
is handled by `overflow-x: auto` on PaneManager.
