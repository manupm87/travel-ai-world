# 0018 — A chat answer's places become cards; the client names the slot

**Status:** Accepted
**Date:** 2026-09-20

## Context

The planner's carousels were always placed: a group id carried the slot it filled
(`slot:<day>:<part>`), so `PlanTrip._on_select` read the day and the part straight out of the id
and needed no session (ADR 0015). Two turns did not fit that shape.

A question about a place ("is there something to do at Margaret Island?") is classified `chat` by
`INTENT_PROMPT`, so `_chat` answered in prose: the island, the Franciscan ruins, the boat trip, the
Palatinus bath — every one of them a corpus document the retrieval step had just returned, none of
them clickable. The traveller had to retype the name to get a card.

And when the classifier did return `find_options` without a day, `_on_message` invented one:
`Slot(day=max(1, intent.day or 1), part=...)` → group `slot:1:morning`. Every card then read
"Add to day 1 · morning" whatever the traveller had in mind, and picking one moved the trip's first
morning. The day was the server's guess, not a choice.

## Decision

**Cards may arrive unplaced.** An `options` event whose cards belong to no slot carries
`slot: null` and a fresh `group_id = "found:<8 hex>"` (`_new_found_group`; the id is random because
there is no slot to name it by and two asks in one session must not collide). Two turns emit one:

1. **The places an answer named.** After `_chat` has streamed its answer it matches the passages it
   was grounded on — `is_place`, and the title present in the answer text (the whole title
   case- and accent-folded, or every word `title_words` keeps, so "the Rudas baths" names the
   "Rudas Thermal Bath" while "the baths" names nothing) — hydrates at most five of them with
   `cards_for`/`_with_photos` in the order the answer named them, `why` empty because the prose
   already explains them, and emits one `options` event, `kind = "restaurant"` when every document
   is eat or drink and `experience` otherwise, `prompt = planner_text("mentioned")`. Nothing is
   emitted when no place matched, and nothing before a stay exists (there is no day to add to yet):
   `_before_stay`'s chat stays prose. Only retrieved passages can become cards, so a place the
   model invented is never offered.
2. **A `find_options` ask with no day.** `_find_options` takes `slot: Slot | None`; with `None` it
   searches EAT for a restaurant ask and SIGHT otherwise, and emits the group unplaced instead of
   assuming day 1.

**The client names the slot.** `SelectAction` gains `slot: Slot | None` — no default, like every
other planner field, so the generated TypeScript keeps it required — and `_on_select` resolves
`_slot_of_group(group) or action.slot`. Neither, and the turn answers with the `stale_group`
sentence exactly as before. Placed groups send `null`; `nb` and `hotels:<district>` are untouched.

On the page, an unplaced card's primary button reads "Add to trip…" and opens `SlotPicker`: an
inline popover (never a modal) with the itinerary's days as a row of buttons and the four parts of
the day as chips, defaulting to the first empty part of the chosen day. A multi-selection carousel
keeps one picker in its footer for the whole batch. `usePlanner.select(groupId, cardIds, slot?)`
sends it, and the reducer's optimistic `put_activity` uses `group.slot ?? action.slot`. A pick into
a slot the traveller just named **adds** to that slot; only a group that names its own slot and
takes a single pick replaces what the slot held, which is what the "Change" sheet means.

## Consequences

Good: a prose answer is actionable without retyping a name, and no day is ever chosen on the
traveller's behalf. The server stays stateless — the slot travels in the action, so nothing has to
be remembered between turns — and group ids keep carrying their meaning where they have one.

Bad: `SelectAction` grew a required field, so every caller (the page, the demo backend, the smoke
script, the tests) had to send `slot`, and one more thing can be wrong on the wire: a `found:`
group selected without a slot is answered as stale. A `found:` id says nothing about what it held,
so a selection on a group the page has forgotten cannot be recovered — acceptable, because the
traveller would ask again anyway. Matching titles in prose is a heuristic: a one-word name that is
also a common word can match loosely, and an answer that renames a place ("the big bath") matches
nothing at all.

Revisit when free-text placement lands ("add the Palatinus to day 2"): the intent would then carry
the slot and the picker becomes the fallback rather than the only way.
