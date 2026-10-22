# 0036 — Cognito metrics in the existing service dashboard

**Status:** Accepted
**Date:** 2026-10-22

## Context

TRA-313 adds an authentication view while keeping the presentation within its
small budget. Three custom CloudWatch dashboards already exist. The documented
free-tier allowance is three dashboards referencing up to 50 metrics each,
subject to account eligibility and shared usage. The service dashboard
introduced with [ADR 0034](0034-native-service-dashboard.md) has 19 raw metric
references and 21 entries including math; the infrastructure dashboard already
has 45 raw references and 47 entries including math. The application signs in
through Cognito with Google federation.

## Decision

Extend the existing service dashboard with exactly five native AWS/Cognito
metric references: FederationSuccesses with SampleCount and Sum,
FederationThrottles with Sum, and TokenRefreshSuccesses with SampleCount and Sum.
Bind UserPool, UserPoolClient and the federation IdentityProvider dimensions to
the existing Terraform resources. Use metric math for failures and federation
success percentage; keep a gap when there are no attempts and do not fill missing
samples with zero. Display federation and refresh activity separately.

Retain three dashboards, 24 raw service metric references (29 entries including
math), the three-hour window and manual refresh. Do not enable Cognito log exports, custom metrics,
threat protection, alarms, new resources or authentication configuration changes.

## Consequences

The change only updates an existing dashboard body and does not require a backend
image deployment. Metrics are aggregate request outcomes, not individual access
logs, unique-user/session counts, or proof of app access. A successful federation
means Cognito issued tokens. Authorization codes without token exchange and
throttling count among unsuccessful federation requests. Refresh failures include
throttling, but no separate refresh-throttle metric is added to preserve the cap.

There is no new dashboard or log-ingestion charge introduced by this extension;
standard CloudWatch pricing and the account's total allowance still apply. The
service panel remains below the 50-metric budget boundary even if math expressions
are counted as entries; future additions must review the budget. Sparse traffic
can leave charts empty. The
[service runbook](../../runbooks/service-dashboard-cloudwatch.md)
describes semantics, cost assumptions and production verification.
