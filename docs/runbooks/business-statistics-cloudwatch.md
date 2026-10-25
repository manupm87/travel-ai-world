# Production business statistics with CloudWatch Logs

This is the production alternative to the
[local Prometheus/Grafana stack](../../infra/aws/metric/README.md). It reuses the
existing core Lambda application log group. No server, custom metric/EMF, log
forwarder, stream, scheduler or historical database scan is created. Grafana
Cloud queries Logs Insights on demand; its free tier does not remove AWS costs.

## Event contract and limits

Core emits one INFO line prefixed `business_event=` after a successful new-trip
write. The compact JSON contains only `version`, `event`, `event_id`,
`city_slug`, `budget_tier`, `pace_preference`, `duration_days` and `created_at`.
Version 1 uses event `trip_created`; the ID is SHA256 of the saved trip UUID's
bytes. This stable pseudonymous key supports deduplication without exposing
the raw UUID. It is not proof of anonymization.

City uses the configured `METRICS_CITY_SLUGS` allowlist plus `other`; budget is
`1`, `2`, `3`, `unspecified`, or defensive `other`. Pace is trimmed/lowercased
and grouped into `relaxed`, `balanced`, `intense`, `unspecified` or `other`.
Duration is explicit, nullable and includes zero; dates are never used to infer
it. No account ID, raw trip UUID, email, title, description, session or itinerary
is emitted by this event. Updates and deletes emit no creation event.

The service default allows the six corpus slugs: `berlin`, `bologna`, `budapest`, `los-angeles`, `madrid` and `miami`.
Core Lambda Terraform derives its sorted allowlist from the filenames in
`src/backend/tools/city_corpus/cities/*.toml`, rejecting an empty list or more
than 100 entries during planning. `METRICS_CITY_SLUGS` remains a configurable
JSON list of at most 100 entries outside that deployment;
unlisted destinations are grouped into `other`. The six-city configuration
requires deployment before it affects production, and only new creation events
then receive the individual city category. Existing `other` events retain that
category: the dashboard cannot recover their individual destinations. No
historical backfill or database scan is performed. When adding a city, also
update the service defaults, local examples and Grafana display names as
described in the [add-city runbook](add-city.md).

Only new events after activation are available. Existing trips are not
backfilled. Deleting a trip leaves its creation observation; attributes are
snapshots at creation. A crash or logging failure after a successful database
write can lose the event. Statistics deduplicate only within the selected
query window and retained logs, not across all history. They are not a durable
transactional ledger or the number of trips currently stored.

## Prepare and review activation

1. Review the event privacy contract. `BUSINESS_EVENTS_ENABLED` defaults
   false for direct/local runs; Terraform's `business_events_enabled` defaults
   true for core Lambda. No `/metrics` endpoint is activated on Lambda.
   The GitHub **aws environment** variable `BUSINESS_EVENTS_ENABLED` forwards
   literal `true` or `false` to Terraform in clean-checkout deployments; when
   absent it defaults to `true`. Set it to `false` for a persistent CI rollback.
2. In Grafana Cloud, select a CloudWatch datasource with **Grafana Assume Role**.
   Obtain the principal account and unique external ID from its instructions.
   Keep live values out of commits, PRs, Linear, screenshots and this runbook.
3. Privately configure Terraform's optional `grafana_cloud_logs_reader` object
   with string fields `account_id` and `external_id`. Default `null` means no
   reader role. Use an ignored local `.auto.tfvars` or a temporary private
   tfvars file; never commit real trust identifiers or credentials.
4. For clean-checkout deployments, configure the GitHub **aws environment**
   variable `GRAFANA_CLOUDWATCH_READER` with that JSON object. The AWS deploy
   workflow forwards it as `TF_VAR_grafana_cloud_logs_reader`; absent/cleared
   configuration becomes JSON `null`. Do not print its value in CI. Clearing it
   can plan destruction of the reader: inspect the plan before every apply.
5. Review the trust, access implications and Terraform plan before an authorized
   apply/deployment. The code and templates do not apply IAM or configure a live
   datasource; both are manual steps. The reader role needs no IAM access key.
6. After approved deployment, obtain `grafana_business_logs_role_arn` and
   `core_api_log_group_name` through Terraform outputs. Use the role ARN in the
   datasource's Assume Role field. Grafana supplies its own exact external ID;
   do not invent a replacement or remove the trust condition.

Keep the same private inputs in local and CI plans. Terraform state stores the
trust policy, including external ID; sensitive variables hide routine output
but do not encrypt those values independently of state storage.

## Reader permissions and privacy boundary

The optional role trusts only the configured Grafana account, conditioned on
exact `sts:ExternalId`. Query actions `StartQuery`, `GetLogGroupFields`, and
`GetQueryResults` are limited to the existing core group ARN. There is no
CloudWatch metrics, log-write, IAM-mutation or access-key permission.

`DescribeLogGroups` and `StopQuery` cannot be resource-scoped in AWS's current
authorization reference. Their resource `*` permissions are constrained by
`aws:RequestedRegion`: the role can enumerate **regional account log-group
metadata** and can stop other queries in that region. It does not gain query
result access to other groups. These residual permissions need operator review.

The core-group read scope exposes **the entire application log group**, not
only `business_event` fields. Existing admin or other logs may contain subjects
or personal information. The dashboard filter is not an authorization boundary;
a datasource user can change the query. Review Grafana membership and access to
the datasource accordingly. AWS IAM offers no business-field-only access here.

Do not silently add `cloudwatch:GetMetricData` to satisfy **Save & Test**. The
datasource's health check may use metrics APIs and fail under this intentional
Logs-only policy. Validate an authorized **Logs Explore** query against the
selected core group instead; investigate permission failures rather than
broadening to all logs/metrics.

## Import and query the dashboard

Import [`business.json`](../../infra/aws/metric/grafana/cloudwatch/business.json)
in Grafana Cloud, choosing the reviewed CloudWatch datasource in the import
picker. This JSON contains placeholders rather than live datasource/account
identifiers. Set **Grupo core_api** to the exact `core_api_log_group_name` output
and **Región** to the deployed region (default `eu-west-1`). The textbox avoids
an automatic query enumerating every log group.

All panels summarize the selected window; start with the default last hour.
Refresh manually. Null/unknown durations show **Sin datos**, never an invented
zero. Known duration averages include explicit zero and exclude null. There is
no scrape-UP panel because production uses application logs, not an exporter.

The queries parse the shared formatter's prefix, extract JSON, filter the event
version and deduplicate before aggregating. To inspect events manually:

```text
parse @message "business_event=*" as payload
| fields jsonParse(payload) as e
| filter e.event = "trip_created" and e.version = 1 and ispresent(e.event_id)
| stats latest(e.city_slug) as city_slug,
    latest(e.duration_days) as duration_days,
    max(@timestamp) as ts by e.event_id
| sort ts desc
```

Dashboard totals/category panels add a second `stats` aggregation. The duration
panels filter `ispresent(duration_days)` and `duration_days >= 0`, so null is
excluded and zero survives. The time series preserves `max(@timestamp)` as `ts`
and groups it with `datefloor(ts, 5m)` after deduplication; using `bin(5m)` on
the original timestamp after the first `stats` would lose that field. Duplicate
events are assigned to the latest observed log timestamp inside the window.

## Cost control and rollback

Each refresh runs seven Logs Insights queries across the selected range.
Filtering to business events does not prevent scanning other lines in the group.
Ingestion and retained bytes also contribute AWS charges. Keep manual refresh,
short windows and the existing `log_retention_days` policy. The default retention
is **14 days**, so older creation events expire and drop out of the counts.
Inspect query statistics (bytes scanned), AWS billing and Grafana Cloud plan limits. Avoid
automatic refresh, dashboard alerts or broad-range queries until budgeted.
No promise of zero cost or current pricing is made.

Rollback: set `business_events_enabled=false` in private local inputs and set
the GitHub aws environment variable `BUSINESS_EVENTS_ENABLED` to `false`, then
deploy through the reviewed workflow. This stops new events without affecting persisted trips
or removing existing logs. Disable/remove the Grafana datasource and set private
reader configuration to `null` locally and in the GitHub aws environment, then
review the role-removal plan before apply. Do not delete the application group.

## Official references

- [Grafana Cloud Assume Role](https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/aws-authentication/)
- [AWS Logs IAM action/resource support](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html)
- [Logs Insights stats and repeated aggregations](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-Stats.html)
- [CloudWatch query editor](https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/query-editor/)
