# 0010 — The hosted zone and the certificate are Terraform resources

**Status:** Accepted
**Date:** 2026-09-15

## Context

The frontend edge (S3, CloudFront, Route 53, ACM) was first deployed by hand
([runbook](../../runbooks/frontend-https-aws.md)) and the Terraform written afterwards (#83)
matched what existed: the CloudFront distribution was imported, but the public hosted zone and
the us-east-1 certificate stayed `data` sources, "read, not created". That kept them out of
Terraform's blast radius, at a price: a fresh environment could not be built from the code,
the `most_recent` certificate lookup would silently switch CloudFront and Cognito to any newer
certificate requested for the domain, and the validation record in the zone was invisible to
the state. The Cognito custom domain (`auth.<domain>`) now depends on the same certificate.

## Decision

`infra/aws/frontend.tf` declares `aws_route53_zone.main`, `aws_acm_certificate.frontend`
(us-east-1, apex + wildcard, DNS validation), the validation CNAME
(`aws_route53_record.certificate_validation`) and `aws_acm_certificate_validation.frontend`.
CloudFront and the Cognito domain take the ARN from the validation resource, so a first apply
waits for issuance. The existing zone, certificate and validation record were imported into
the state on 2026-09-15; the plan after the import was empty.

The blast-radius concern is answered in code rather than by leaving the objects unmanaged:
both root resources carry `lifecycle { prevent_destroy = true }`, so a `terraform destroy` or a
renamed resource fails the plan instead of deleting the zone. The `name_servers` output is
what the registrar must delegate to; the registrar itself stays outside Terraform.

## Consequences

- Good: one apply builds the whole edge on a new account or domain; the certificate in use is
  the one in the state, not the newest one in the account; the validation record survives.
- Bad: on a brand-new domain the certificate stays `PENDING_VALIDATION` until the registrar
  delegates to the zone, so the first apply is two steps (zone, delegate, everything else), as
  the README describes. Deleting the zone on purpose requires removing `prevent_destroy` first.
- Revisit if the domain moves to another account or registrar-managed DNS: then the zone
  becomes a data source again and this ADR is superseded.
