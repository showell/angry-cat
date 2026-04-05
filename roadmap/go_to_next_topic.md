# Go to next topic after "Read Later" / "Mark topic read"

When the user hits "Read Later" or "Mark topic read", they are implicitly done
with the current topic. The app should advance automatically rather than leaving
them sitting on a topic they have just dismissed.

## Definition of "next topic"

- If there are any unread topics remaining in the current channel's topic list,
  go to the first unread topic that is not the current one (scanning `all_topic_rows`
  in display order).
- If there are no unread topics left, clear the topic selection.
- Further optimization (e.g. cross-channel advancement) can be driven by user
  feedback later.

## Implementation plan

1. **`TopicList.get_next_unread_topic_id(current_topic_id: number): number | undefined`**
   Scan `all_topic_rows` for the first row where `unread_count() > 0` and
   `topic_id() !== current_topic_id`. Return its `topic_id()`, or `undefined`
   if none found.

2. **`Navigator.go_to_next_topic(): void`**
   Get the current `topic_id`. If none, return early. Call
   `topic_list.get_next_unread_topic_id(topic_id)`. If a next topic is found,
   call `set_topic_id(next_id)`; otherwise call `clear_message_view()`.

3. **`nav_button_panel.ts`**
   Call `navigator.go_to_next_topic()` at the end of both the "Read later"
   and "Mark topic read" button callbacks.

## Notes

- `set_topic_id` → `update_topic` → `StatusBar.inform("You can read or reply now.")`
  will overwrite the "Read later" celebration message. This is acceptable since
  the button also hides itself, giving the user clear visual confirmation.
- Marking a topic read is async (the unread count update arrives via a Zulip
  event), but advancing immediately is fine — we explicitly exclude the current
  topic when searching, so we won't re-select it.
