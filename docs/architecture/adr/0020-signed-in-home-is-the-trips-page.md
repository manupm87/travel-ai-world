# 0020 — The signed-in home is the trips page; the planner makes and reads one trip

**Status:** Accepted
**Date:** 2026-09-21

Amends [0019](0019-trips-live-in-the-planner.md) (§ "The planner is the only signed-in surface").

## Context

ADR 0019 folded the dashboard and the trip viewer into the planner: one surface, one rendering,
one set of components. The trips moved into the planner's trip pane, `/dashboard/` and `/trip/`
became client redirects, and signing in landed on `/plan/`.

That was right about the *rendering* and wrong about the *entrance*. Signing in dropped the
traveller into an empty workspace — three columns, a transcript with nothing in it, a map with no
pins — with the trips they already had reachable only by noticing that the middle column happened
to be listing them, and only until the first thing was said, after which they lived behind a
sheet. A returning traveller has two intentions, "open the one I have" and "start the next one",
and the planner answered the second one loudly and the first one by accident. The owner's ask was
exactly that: *"signing in should take us to 'my trips', and show there the same widget for
talking to the AI and starting a new one, plus the cards of the trips we have."*

Nothing about ADR 0019's model needs to change to fix this. The trips are already a component
(`TripsList`), the ask is already a component on the landing, and the planner already reopens a
trip from `?trip=` and locks it when its phase is not `upcoming`. What was missing was a page that
puts the two together.

## Decision

**`/dashboard/` is the signed-in home, "Your trips".** It stops being a redirect and becomes a
reading page in the `(app)` group — the shell, the aurora and the route guard it already had. It
holds two things in the order they are wanted: the ask, and the account's trips. Sending the ask
opens `/plan/?q=<ask>`; a card opens `/plan/?trip=<id>`; "New trip", beside the trips' heading,
opens `/plan/`.

**The ask is one component in two places.** `components/common/AskComposer.tsx` is the field, the
typewriter placeholder, Enter-sends/Shift+Enter-breaks, the conic focus ring and the fade on the
way out. `components/landing/AskField.tsx` keeps everything about signing in (the dialog, the
`?redirect=` round trip) and renders it; the home renders it and navigates, because the guard has
already settled who is reading. A traveller who asked on the landing before they had an account
meets the same field afterwards, in the same place on the page.

**Signing in lands on `/dashboard/`.** `LoginModal` and `AuthCallback` default there when nothing
was asked for; an explicit redirect — the landing's own `/plan/?q=…`, or the path the route guard
remembered — still wins. The account menu's "Your trips" goes to the home; the header's pill still
opens the planner directly.

**The planner does not change.** It still lists the trips in its pane while nothing has been said,
still offers the "Your trips" sheet, still reopens a saved trip from `?trip=` and still refuses
every change to one that is ongoing or past (ADR 0019, enforced by `core_api` with 409
`TRIP_LOCKED`). The home decides nothing about read-only: it links to the planner and the planner
applies its own rule. `/trip/?id=` keeps forwarding to `/plan/?trip=`.

## Consequences

**Good.** The entrance answers both intentions at once, and neither is hidden behind a gesture.
The trips are on a page that can be linked, bookmarked and shared as "where my trips are", which
is what people expect of a signed-in home. The ask stops being duplicated the moment a second
surface wants it — there is one implementation and one set of tests for the gesture. The planner
loses nothing: it is still where a trip is born and where it comes back.

**Bad.** There is one more navigation between signing in and planning, for the traveller who only
ever wants a new trip; the field at the top of the home is the compensation, and the header's pill
is still one press. `TripsList` now renders on two surfaces with different widths, so a change to
it has to be looked at in both.

**To revisit.** If the home grows a third thing — suggestions, a city of the month, anything the
planner would otherwise carry — it should be weighed against the field, which is the page's
purpose. And the planner's own trip pane list becomes redundant the day the home is the only way
in; it stays for now because a traveller deep in a plan should not have to leave it to switch
trips.
