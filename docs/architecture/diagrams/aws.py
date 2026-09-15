"""AWS architecture v2 (split API), as code.

Renders ``docs/architecture/aws-architecture.png`` with the official AWS icons
(`diagrams` + Graphviz) and writes the SHA-256 of this file next to it
(``aws.sha256``) so ``just docs-check`` can tell when the image is stale without
needing Graphviz in CI.

Run ``just diagrams`` (Graphviz is installed in the devcontainer). The decisions
drawn here are recorded in ADR 0008; the Terraform in ``infra/aws/`` still
implements the v1 shape (ALB) until the v2 issues land.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import ECR, Fargate
from diagrams.aws.database import RDSPostgresqlInstance
from diagrams.aws.management import CloudwatchLogs
from diagrams.aws.ml import Bedrock
from diagrams.aws.network import (
    IGW,
    NLB,
    APIGateway,
    CloudFront,
    NATGateway,
    Privatelink,
    Route53,
)
from diagrams.aws.security import ACM, IAMRole, SecretsManager
from diagrams.aws.storage import S3
from diagrams.gcp.security import Iam as GoogleIdentity
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.client import Users

HERE = Path(__file__).resolve().parent
SOURCE = Path(__file__).resolve()
OUTPUT = HERE.parent / "aws-architecture"  # `diagrams` appends the extension
STAMP = HERE / "aws.sha256"

GRAPH_ATTR = {
    "fontsize": "22",
    "pad": "0.6",
    "nodesep": "0.55",
    "ranksep": "1.1",
    "splines": "spline",
}
QUIET = {
    "style": "dashed",
    "color": "#8a8a8a",
    "fontcolor": "#5a5a5a",
    "fontsize": "11",
}
LABEL = {"fontsize": "12"}


def source_digest() -> str:
    return hashlib.sha256(SOURCE.read_bytes()).hexdigest()


def render() -> None:
    with Diagram(
        "Travel AI World — AWS architecture v2 (split API)",
        filename=str(OUTPUT),
        outformat="png",
        show=False,
        direction="LR",
        graph_attr=GRAPH_ATTR,
    ):
        browser = Users("Browser\nNext.js static export")
        google = GoogleIdentity("Google Identity\nOIDC sign-in · tokeninfo")
        ci = GithubActions("GitHub Actions\nOIDC → CI role")
        dns = Route53("Route 53\ndelegated subdomain")

        with Cluster("AWS account · eu-west-1"):
            with Cluster("Edge (global)"):
                cert = ACM("ACM certificate\n(us-east-1)")
                cdn = CloudFront("CloudFront\nsingle public origin")
                site = S3("S3 bucket (private, OAC)\nstatic frontend")

            apigw = APIGateway(
                "API Gateway · REST, regional\n/api/v1/ai/* → STREAM (SSE)\n/api/v1/* → buffered"
            )
            vpclink = Privatelink("VPC Link")

            with Cluster("VPC"):
                with Cluster("Public subnets"):
                    igw = IGW("Internet gateway")
                    nat = NATGateway("NAT gateway")

                with Cluster("Private subnets"):
                    nlb = NLB("NLB (internal)\n:8000 core · :8001 ai")
                    with Cluster("ECS cluster · Fargate"):
                        core = Fargate("core-api\nauth · users · trips")
                        ai = Fargate("ai-api\nchat streaming · RAG")
                    db = RDSPostgresqlInstance(
                        "RDS PostgreSQL\ncore db · ai db (pgvector)"
                    )

            with Cluster("Regional services (used by both Fargate services)"):
                bedrock = Bedrock("Bedrock\nLLM · embeddings (ai-api)")
                secrets = SecretsManager(
                    "Secrets Manager\ninjected at task start,\neach service reads only its own"
                )
                roles = IAMRole("IAM task roles\none per service")
                ecr = ECR("ECR\ncore-api · ai-api images")
                logs = CloudwatchLogs("CloudWatch Logs\none group per service")

        # Public path: browser → CloudFront → S3 (site) or API Gateway (/api/*).
        browser >> Edge(label="DNS", **QUIET) >> dns
        browser >> Edge(label="HTTPS", **LABEL) >> cdn
        cert >> Edge(**QUIET) >> cdn
        cdn >> Edge(label="default: static site", **LABEL) >> site
        (
            cdn
            >> Edge(label="/api/*  (no cache, Authorization forwarded)", **LABEL)
            >> apigw
        )
        browser >> Edge(label="Sign in with Google", **QUIET) >> google

        # Private path: API Gateway → VPC Link → NLB → Fargate.
        apigw >> vpclink >> nlb
        nlb >> Edge(label=":8000", **LABEL) >> core
        nlb >> Edge(label=":8001", **LABEL) >> ai

        # Service dependencies.
        core >> Edge(label="core db", **LABEL) >> db
        ai >> Edge(label="ai db (pgvector)", **LABEL) >> db
        ai >> Edge(label="HTTP, caller's bearer token", **LABEL) >> core
        ai >> Edge(label="IAM auth (task role)", **LABEL) >> bedrock
        core >> Edge(label="egress", **QUIET) >> nat >> Edge(**QUIET) >> igw
        igw >> Edge(label="tokeninfo", **QUIET) >> google

        # Platform. Per-task edges (image pull, secrets, roles, logs) are implied
        # by the cluster label; drawing them for both services hides the request flow.
        ci >> Edge(label="push images · terraform apply", **QUIET) >> ecr
        secrets - Edge(**QUIET) - roles - Edge(**QUIET) - ecr - Edge(**QUIET) - logs

    STAMP.write_text(source_digest() + "\n", encoding="utf-8")


if __name__ == "__main__":
    render()
    print(f"rendered {OUTPUT}.png; stamp {STAMP.name} = {source_digest()[:12]}…")
