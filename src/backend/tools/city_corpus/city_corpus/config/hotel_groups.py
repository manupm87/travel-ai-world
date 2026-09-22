"""The hotel groups, as the photo stage has to know about them (TRA-211).

A chain hotel does not behave like the family pension next door. Its `website`
tag points at a brand domain that redirects to the group's booking platform
(`ibis.com` → `all.accor.com`), the page it lands on publishes the group's logo
or a global campaign banner as its `og:image`, and the group's own name is
written on every one of its houses. TRA-208 read all three as the marks of a
parked or sold domain and dropped 156 chain hotels across Budapest, Berlin and
Madrid — Four Seasons, Marriott, Hilton, NH, Radisson among them.

So the groups are listed. `GROUP_DOMAINS` says which redirect targets are the
hotel's own site after all; `BRAND_ASSET_PATH` says which of their pictures are
the brand rather than the house; `OG_SKIPPED_DOMAINS` names the groups whose
preview is never the hotel; and `CHAIN_NAMES` recognises a chain hotel by name
so the report can list the ones still missing a photo, for the next curator.

A list of names is not a rule, which is why everything here is data and the
rules that read it live in `sources/photos.py`. `GROUP_DOMAINS` is copied word
for word, in this order, into `ai_api/infrastructure/site_previews.py`, which
does the same lookup live and may not import this package: change one, change
the other.
"""

import re

GROUP_DOMAINS: tuple[str, ...] = (
    "accor.com",
    "adinahotels.com",
    "aohostels.com",
    "barcelo.com",
    "bestwestern.com",
    "cataloniahotels.com",
    "eurostarshotels.com",
    "hilton.com",
    "hotel-bb.com",
    "hyatt.com",
    "iberostar.com",
    "ihg.com",
    "kempinski.com",
    "leonardo-hotels.com",
    "marriott.com",
    "melia.com",
    "motel-one.com",
    "nh-hotels.com",
    "petitpalace.com",
    "premierinn.com",
    "radissonhotels.com",
    "ritzcarlton.com",
    "room-matehotels.com",
    "scandichotels.com",
    "steigenberger.com",
    "vinccihoteles.com",
)
"""Registrable domains a brand's own domain is allowed to redirect to.

`ibis.com`, `sofitel.com` and `all.accor.com` are all Accor; the page the hop
lands on is the hotel's page, with the hotel's own photograph on it. Every
subdomain counts (`all.accor.com`, `www.espanol.marriott.com`), and nothing
else does: a hotel domain that now sends you to a parking page or to a reseller
is still parked, sold or gone.

Kept in step by hand with `ai_api/infrastructure/site_previews.py`.
"""

BRAND_ASSET_PATH = re.compile(
    r"logo|brand|generic|default|placeholder|maldives", re.IGNORECASE
)
"""What a group publishes as its preview when the page has no photo of the
house: the chain's logo, a brand asset, the campaign banner of a resort on the
other side of the world (IHG offers the Maldives for a Crowne Plaza in Madrid).
Checked on top of the usual `LOGO_PATH`, and only for a page on a group domain —
`brand` and `generic` are ordinary words in an independent hotel's file names."""

OG_SKIPPED_DOMAINS: frozenset[str] = frozenset()
"""Groups whose `og:image` is the same picture on every page of the site, whatever
the hotel. Theirs is not read at all, and the largest-picture rule looks for the
house's own photograph further down the same page.

Empty, and measured that way. Both candidates cost more hotels than they saved on
Budapest, Berlin and Madrid:

* **IHG** offers a Maldives resort as the preview of the Crowne Plaza Madrid — but
  the right photograph for the Crowne Plaza Budapest, which skipping the group's
  preview took away. A campaign banner is a `BRAND_ASSET_PATH` problem instead,
  which is where `maldives` is.
* **a&o** really does publish the lobby of its hostel in Venice for every house it
  runs, and the shared-picture rule already refuses it. Skipping the preview gains
  nothing: the group's gallery is loaded by script, so the page a build fetches
  carries no picture of the house, and two hostels that had one lost it.

So a group belongs here only when its preview is the same picture on two of its
hotels **and** its pages carry the house's own photograph in their markup. Check
both before adding one."""

CHAIN_NAMES = re.compile(
    r"\b("
    r"a&o|ac hotel|accor|adagio|adina|aloft|autograph collection|"
    r"barcel[oó]|b&b hotel|best western|campanile|catalonia|citadines|"
    r"conrad|courtyard|crowne plaza|doubletree|eurostars|exe hotel|"
    r"four points|four seasons|h10|hampton|hilton|holiday inn|hotel indigo|"
    r"hyatt|ibis|iberostar|intercontinental|kempinski|le m[eé]ridien|"
    r"leonardo|marriott|meininger|meli[aá]|mercure|motel one|moxy|"
    r"nh collection|nh hotel|novotel|park inn|park plaza|petit palace|"
    r"premier inn|pullman|radisson|riu|ritz-?carlton|room mate|scandic|"
    r"sheraton|sofitel|st\.? regis|steigenberger|travelodge|tryp|vincci|"
    r"waldorf astoria|westin"
    r")\b|\bnh\b",
    re.IGNORECASE,
)
"""A hotel that belongs to a chain, by its name. Used for one thing only: the
report's list of notable hotels still without a photo, so a curator knows where
to look next. It decides nothing about the corpus, so a false positive costs a
line in a report and a miss costs nothing at all."""


def host_of(url_or_host: str) -> str:
    """The bare host of a URL, or a host as it is."""
    host = url_or_host.split("://", 1)[-1].split("/", 1)[0].split("?", 1)[0]
    return host.rsplit("@", 1)[-1].split(":", 1)[0].lower().rstrip(".")


def _under(host: str, domains: "frozenset[str] | tuple[str, ...]") -> bool:
    return any(host == domain or host.endswith(f".{domain}") for domain in domains)


def is_group_site(url_or_host: str) -> bool:
    """Whether this URL or host belongs to one of the listed groups.

    Subdomains included: `all.accor.com` is Accor, `notaccor.com` is not.
    """
    return _under(host_of(url_or_host), GROUP_DOMAINS)


def skips_preview(url_or_host: str) -> bool:
    """Whether this group's `og:image` is a banner rather than the hotel."""
    return _under(host_of(url_or_host), OG_SKIPPED_DOMAINS)


def is_chain(name: str | None) -> bool:
    """Whether this hotel's name is a chain's."""
    return bool(name and CHAIN_NAMES.search(name))
