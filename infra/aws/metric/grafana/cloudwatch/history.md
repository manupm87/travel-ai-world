# Production Grafana imports

`business.json` displays creation events from CloudWatch Logs Insights. Import it
with an existing CloudWatch datasource as described in the
[production runbook](../../../../../docs/runbooks/business-statistics-cloudwatch.md).

## Retained trips by city

`history.json` is a separate, fixed snapshot dashboard, **Kyrian World · Histórico
por ciudad** (`kyrian-trip-history`). It requires an existing datasource using the
Infinity plugin (`yesoreyeram-infinity-datasource`). Import the JSON through
Grafana's dashboard import screen and select that datasource for `DS_INFINITY`.
The template contains only CSV headers and deliberately displays no sample counts.

To populate a reviewed snapshot:

1. Obtain an authorized, one-off aggregate of retained DynamoDB trip records,
   filtered by a fixed creation cutoff. Use normalized city names and count each
   retained trip once. Retain missing or unrecognized cities as an explicit
   aggregate category rather than dropping them.
2. In the city bar panel's Infinity inline CSV target, replace the header-only
   `city,trips` dataset with aggregate rows. Use numeric, nonnegative integer
   counts and proper CSV quoting. Include only city names and counts; never paste
   trip identifiers, user identifiers, titles or raw database records.
3. Replace the header's pending status with the capture time, creation cutoff,
   source and aggregation scope. State whether cities with no retained trips
   were omitted or explicitly included with zero counts. Preserve the snapshot
   qualifications in the header, panel descriptions and footer.
4. Verify the bar, shared total and shared table agree with the reviewed
   aggregate. Save the populated dashboard in Grafana; keep production counts,
   capture metadata and datasource identifiers out of the repository template.

The table and total reuse the bar panel's data through Grafana's Dashboard
datasource. The total sums only the numeric `Viajes` column. Viewing this dashboard
issues no AWS queries: the dataset is inline and refresh is manual. The original
DynamoDB read still has its own read cost. No scheduled scan, new AWS service,
permission or automatic refresh is configured.

This is inventory retained at capture, not a complete creation history. Deleted
trips cannot be recovered this way. A nontransactional scan can observe records
at different moments. The creation cutoff is fixed; changing Grafana's time
picker does not filter the snapshot. Do not add these counts to event dashboards:
their populations can overlap. CloudWatch's historical `other` events remain
unchanged, and later database changes do not update the snapshot.

The portable total query is hidden until a real aggregate is loaded, so an empty
CSV cannot be presented as zero trips. After populating the source CSV and
capture metadata, unhide the Dashboard target of panel 3 and verify that its
sum matches the city table. The empty template should show no data.
