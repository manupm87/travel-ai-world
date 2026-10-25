# Portable CloudWatch dashboards

These JSON imports use the existing CloudWatch Logs reader. They do not provision
AWS resources, change IAM, enable automatic refresh or read DynamoDB.

| Import | UID | Scope |
|---|---|---|
| `business.json` | `kyrian-business-cloudwatch` | Trip creation observations |
| `observatory.json` | `kyrian-tfm-observatory` | Business events, core HTTP operations and explicitly static TFM evidence |

The observatory is independent of the business dashboard. Import it through
**Dashboards → New → Import**, select the reviewed CloudWatch datasource and set
the **Region** and **core_api log group** textboxes to deployment outputs. The
group textbox is deliberately blank in the portable file. Import into the
project's organization only after confirming its identity and access; the JSON
contains no account identifiers, email addresses or credentials.
The optional **Detalle de negocio** link expects the separate business import
in the same organization. Import that dashboard too, or remove the link if the
organization does not use it.

## Query and display contract

The default range is 24 hours and refresh is manual. Six Logs Insights queries
run per complete load. Eight executive cards use Grafana's Dashboard datasource
to reuse the raw results of tables 101 and 102. Two profile charts
reuse table 105: pace horizontal bars and a budget donut. Each
groups the raw category and sums `viajes`; counting combination rows would
misstate the distribution. All shared targets use `withTransforms: false`.
Keep all three source tables present
and expanded: removing them or placing them in a collapsed row can prevent the
cards from obtaining data. The other four queries provide business history,
HTTP history, creation profile combinations and the 25 busiest HTTP routes.
Profile combinations are limited to the top 100 rows. Derived distributions
therefore describe those combinations and can omit others; they are not a
complete distribution or inventory export. Category mappings preserve `other`
and `unspecified`; empty results remain empty rather than synthetic zeros. Grafana's time range still bounds every live query.

The destination bar instead uses an existing Infinity datasource selected at
import (`DS_INFINITY`). Its inline CSV has only `city,trips` headers in this
portable template: no invented counts or production metadata are committed.
Populate it with reviewed city/count aggregates and update text panel `44` with
capture time, fixed creation cutoff and source. This is retained inventory at
capture, excludes deleted trips, and is not a transactional creation history.
It does not follow the time picker, correct old CloudWatch events or update
after database changes. Never sum it with event counts: populations can overlap.
The CSV adds no AWS query when viewed; its original one-off database read has
its own cost. No scheduled capture is configured.

Business events use the persisted creation snapshot and deduplicate by
`event_id` within the selected window. Duration includes explicit zero and
excludes missing values. Destination values are allowlisted upstream: `other`
cannot be turned back into a city name. The profile table combines destination,
budget and pace rather than issuing separate distribution queries.

HTTP events are `access_log` version 1 from **core_api only**. Duration ends when
the final ASGI message is ready, before the server send. It is not browser
latency, first-token latency or an AI turn duration. An interrupted response can
have an already-sent 2xx status; its count is independent of 5xx. The first
invocation marker describes the first recognized Lambda request in a process,
not `Init Duration` from REPORT. There is no availability or SLA inference.

Both summary queries remove their empty aggregate row before division. An
empty result must remain **Sin muestras**, not zero or an availability claim.
The shared cards select raw field names before applying display names; keep
`withTransforms: false` on their Dashboard targets.

## Academic evidence is static

The collapsed academic appendix quotes the supplied TFM memory, cutoff 24 October 2026, sections
8.2–8.4 and table 34. The source is `docs/memoria/main.pdf`; values are native
Markdown text, deliberately disconnected from the time picker and datasource.
The corpus has 33,264 documents across six cities. Historical destinations use the reviewed inline city aggregates. Original
events expose only the allowlist in effect when they were created. Deploying an expanded allowlist does not recover historical `other`
destinations. The 623 historical AI turns and
USD 2.05 AI cost have a different scope from live core HTTP requests and total
AWS billing. Update or remove static evidence if the memory is revised; never
present it as a current measurement.

The overview uses eight compact cards, two trends, a fixed destination snapshot
and two profile charts of selected-period events.
Expanded profile, route and summary tables keep the live results auditable.
Only static memory evidence and the interpretation guide are in collapsed rows;
no shared datasource lives in those rows. Access to the same Grafana organization
is independent of AWS identity: this JSON does not configure AWS SSO, invite
users or change the organization subscription.

## Validation and cost

After import, verify the datasource, group and region, then inspect query errors
before interpreting empty results. Verify raw summary field names in the table
panels and confirm that the cards match those values. Check both time series,
the profile table and route percentiles with actual retained events. Do not
create artificial production activity solely to fill the dashboard.

CloudWatch charges depend on scanned bytes. Six queries is a request-count
bound, not a monetary cap; each query can scan other records in the group.
Prefer short ranges and manual refresh. Do not enable scheduled refresh or
extend retention without reviewing the project's total budget. The existing
reader can read the entire core log group, not only the displayed event fields.
For deployment and capture details, see the
[production runbook](../../../../../docs/runbooks/business-statistics-cloudwatch.md).
