# Service dashboard in CloudWatch

The native `travel-ai-service-metrics` dashboard complements the Grafana business
metrics for demos. Its name uses `name_prefix`; the name above is the default prefix's.
It reads native metrics only: no middleware, custom metrics or log queries. Per-route
latency and 5xx and cold starts are in the [access logs dashboard](access-logs-cloudwatch.md);
DynamoDB and CloudFront in the [infrastructure dashboard](infrastructure-dashboard-cloudwatch.md).

## Create and open

The resource lives in `infra/aws/dashboard.tf`; its body in
`infra/aws/metric/cloudwatch/service_metrics.json.tftpl`. Terraform reads the real names
of the functions and of the stage, and the Cognito dimensions, from the existing resources.
Bedrock `ModelId` dimensions use `bedrock_chat_model` and `embeddings_model` exactly as
configured, including the chat model's EU inference-profile prefix.
The production dashboard is already imported and managed in the remote Terraform state: do
not import it again into that state or create a second dashboard under another name.
Changes to it go through a reviewed plan.

From `infra/aws`, with the AWS session and the Terraform backend set up as in the
[infrastructure runbook](../../infra/aws/README.md):

```bash
terraform plan -out=service-dashboard.tfplan
terraform show service-dashboard.tfplan
# apply only a reviewed plan: do not deploy changes unrelated to the dashboard
terraform apply service-dashboard.tfplan
terraform output -raw service_dashboard_url
```

In production the plan must update only the body of `aws_cloudwatch_dashboard.service[0]`.
If other changes show up, resolve them before applying. Do not change the Lambda images to
extend the dashboard. `service_dashboard_enabled=false` removes it through a later plan
without deleting the source metrics or touching the applications.

It can also be created from CloudWatch → Dashboards → Create dashboard by pasting the
rendered JSON into Actions → View/edit source. The `.tftpl` template needs its ten
variables resolved before pasting. Only when adopting a hand-made copy into another state,
import it into Terraform before the next apply, with the same name and configuration:

```bash
terraform import 'aws_cloudwatch_dashboard.service[0]' travel-ai-service-metrics
```

Access needs an AWS session with permission to create/view dashboards and read the
metrics. The dashboard stays private in the AWS console.

## What it shows

| Signal | Source and statistic | Scope |
|---|---|---|
| Invocations | Lambda `Invocations`, Sum/min | Each function |
| Duration p50/p95 | Lambda `Duration`, percentiles, ms | Each function, without cold start |
| Execution failures | Lambda `Errors`, Sum/min | Each function; not every HTTP 5xx |
| Throttles | Lambda `Throttles`, Sum/min | Each function |
| Concurrency | Lambda `ConcurrentExecutions`, Maximum/min | Not an exact HTTP gauge |
| Requests/s | API Gateway `Count`, SampleCount / period | Whole stage |
| HTTP 4xx/5xx | API Gateway, Sum/min | Whole stage |
| Latency p50/p95 | API Gateway `Latency`, ms | Whole stage |
| HTTP 5xx (%) | 100 × 5xx / requests per minute | Only when there are requests |
| Google federation | Cognito `FederationSuccesses`, SampleCount/Sum; `FederationThrottles`, Sum/min | Pool, web client and Google provider |
| Token refresh | Cognito `TokenRefreshSuccesses`, SampleCount/Sum per minute | Pool and web client |
| Model calls | Bedrock `Invocations`, Sum/min | Configured chat and embedding ModelId |
| Model tokens | Bedrock `InputTokenCount`, Sum/min; `OutputTokenCount`, Sum/min for chat | Configured models; no output-token series for embeddings |
| Model latency p50/p95 | Bedrock `InvocationLatency`, percentiles, ms | Chat and embeddings separately |
| First token p50/p95 | Bedrock `TimeToFirstToken`, percentiles, ms | Configured chat ModelId; streaming only |
| Model errors and throttles | Bedrock `InvocationClientErrors`, `InvocationServerErrors`, `InvocationThrottles`, Sum/min | Each configured ModelId |

It uses the `FunctionName` and `ApiName, Stage` dimensions. Detailed per-method/route
metrics are not turned on. Names and statistics follow the
[Lambda](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html)
and [API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html)
documentation.

Availability is not inferred from the absence of errors: there is no synthetic probe.
Percentiles need enough traffic. Missing series are not turned into zeros. API Gateway
latency and Lambda duration are not the time to first token nor the whole browser
experience; SSE requests can last the whole stream.

## Cognito: reading it and its limits

Sign-in is federated through Google, so the dashboard uses `FederationSuccesses`, not the
direct-authentication `SignInSuccesses`. The dimensions are `UserPool`, `UserPoolClient` and
`IdentityProvider`, bound to the existing resources; token refresh uses only `UserPool` and
`UserPoolClient`. Authentication itself is unchanged, and the section adds no business or AI
metrics and no alarms.

SampleCount counts published attempts and Sum counts successes, so failures are
SampleCount − Sum. A federation success needs Cognito to issue tokens: authorization codes
never exchanged and throttling also produce samples without a success. That is why the panel
labels those failures "No tokens issued" and shows `FederationThrottles` as a subset of them,
not as extra failures. The percentage is 100 × successes / attempts and stays empty without
attempts.

Token refresh has its own series: attempts, successful refreshes and failures (throttling
included), with the same subtraction. There is no separate `TokenRefreshThrottles` series,
which keeps the new references to five. Gaps are not filled with zeros. The metrics can be
published late and only cover the samples AWS emits for this pool and client: they do not
count unique users, sessions, the app's access-list denials or cancellations that never reach
Cognito. They are not per-user audit logs and hold no emails, tokens, IPs or user data. The
federation chart shows counts per minute on the left axis and the success rate on the right.

Reference: [Cognito metrics](https://docs.aws.amazon.com/cognito/latest/developerguide/metrics-for-cognito-user-pools.html).

## Bedrock: reading it and its limits

The six Bedrock charts use only native `AWS/Bedrock` metrics and the `ModelId`
dimension in the configured region. The chat model uses the complete configured
EU inference-profile ID, not its underlying foundation-model ID; embeddings use
their configured model ID. A variable change selects a different series rather
than combining the old model's history with the new one. Other workloads using
the same model in this account and region, including evaluation, CLI calls and
indexing, also contribute. These are not metrics exclusive to `ai_api`.

`Invocations` counts calls accepted for processing, including calls that later
fail. Throttled calls and requests rejected during input validation before
processing are excluded. Throttles are therefore shown separately, without an
error percentage based on an incompatible denominator. SDK retries can create
several calls per application turn. Model-specific error series may omit errors
that occur before AWS identifies the model. Client errors can also include quota
rejections that AWS does not classify as throttles.

`InvocationLatency` measures time to the last model token, not the whole planner
turn, retrieval, tool execution or the browser's end-to-end wait. The embedding
chart measures the embedding invocation rather than the complete RAG search.
`TimeToFirstToken` applies only to streaming calls (`ConverseStream` and
`InvokeModelWithResponseStream`): it is not time to the first SSE event, which can
be progress rather than model text. Both latency charts use milliseconds and
p50/p95 over each minute; counts and token sums are also per minute, not totals
for the visible window.

Missing samples stay missing. No per-request tokens/second, dedicated timeout
count, cost, quality, user or availability claim is derived from these aggregates.
In particular, mixing streaming and non-streaming aggregates would not produce a
reliable per-request generation speed. The existing DynamoDB turn traces and
`/admin` remain the source for tool and RAG details, application timings and AI
analysis.
It does not export those traces, enable model invocation logging or capture
prompts, responses or user identifiers.

Reference: [Bedrock runtime metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/monitoring-runtime-metrics.html).

## Demo script

1. Open the dashboard and pick the last 3 hours.
2. Browse trips in the application to generate `core_api` activity.
3. Generate an itinerary to show `ai_api` activity and duration.
4. Wait a few minutes for the metrics to be published and refresh by hand.
5. For Cognito, sign in with Google as usual, wait for AWS to publish the samples and
   refresh. Refreshes only show up when the client refreshes its tokens, which is not the
   same as an API call. Do not cause failures or throttling.
6. For Bedrock, inspect existing model activity and compare chat and embedding
   calls, tokens, latency and streaming TTFT. No extra inference is needed to
   verify published data. A wider window may be needed for sparse traffic; refresh
   manually. Check that the model IDs match the configured models, without adding
   historical models just to populate a chart.
7. Explain traffic, duration and concurrency. Show real errors if there are any;
   do not cause production failures or present missing data as success.

If it is empty, check the account, region, dimensions and time window. No traffic does not
prove an outage. Confirm that the calls go through the `prod` stage and that you are not
testing local services.

## Cost

It reuses native metrics. No custom metrics, alarms, probes, detailed API Gateway metrics
or Logs Insights scans are created. The dashboard holds 41 native metric references and 46
entries counting math expressions, under the 50 per dashboard of the free tier AWS publishes
(up to 3 custom dashboards a month). With the infrastructure and HTTP access-log dashboards
that makes three: Cognito and Bedrock reuse this one, with no fourth dashboard, Cognito log
export, Bedrock invocation logging, custom metrics or advanced security. The Bedrock
extension makes no model calls or backend changes. Before extending it, check the account's usage and the
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/). A zero total bill is not
guaranteed: the application's normal traffic and the other resources keep their costs.
Keep manual refresh for the demo.
