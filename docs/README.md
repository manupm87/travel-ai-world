# Documentation

| Where | What |
|---|---|
| [architecture/overview.md](architecture/overview.md) | System diagram, request flows, service boundaries, [AWS target diagram](architecture/aws-architecture.drawio.svg) (draw.io, editable in VS Code) |
| [architecture/adr/](architecture/adr/README.md) | Architecture Decision Records (why things are the way they are) |
| [architecture/vector-store-spike.md](architecture/vector-store-spike.md) | Qdrant vs S3 Vectors, measured: the input to ADR 0014 |
| [architecture/rag-evaluation.md](architecture/rag-evaluation.md) | Recall@k and MRR of the deployed index, how to run them, the baseline and its misses |
| [architecture/agent-evaluation.md](architecture/agent-evaluation.md) | Scripted conversations against the planner: checks, how to run them, the gate for planner changes and the baseline |
| [runbooks/](runbooks/local-dev.md) | How to run, ship and observe: [local-dev](runbooks/local-dev.md), [docker](runbooks/docker.md), [deploy](runbooks/deploy.md), [release](runbooks/release.md), [add-city](runbooks/add-city.md), [access](runbooks/access.md), [agent-delivery](runbooks/agent-delivery.md); CloudWatch: [service dashboard](runbooks/service-dashboard-cloudwatch.md), [infrastructure dashboard](runbooks/infrastructure-dashboard-cloudwatch.md), [access logs](runbooks/access-logs-cloudwatch.md), [business statistics](runbooks/business-statistics-cloudwatch.md); [frontend-https-aws](runbooks/frontend-https-aws.md) is the console view of the Terraform-managed frontend |
| [api/](api/) | Generated OpenAPI documents (`core-api`, `ai-api`) — source of the frontend's types |
| [design/](design/) | [`kyrian-world.md`](design/kyrian-world.md), the design reference (palette, type, Kiri); `ideas.pen`, the Pencil design file |
| [memoria/](memoria/README.md) | The project report (LaTeX, Spanish, two columns): business case, team, current and target AWS architecture, AI agent and RAG, data quality, DevOps, evaluation |

Conventions: `README.md` files are for people (what it is, how to run it); `AGENTS.md` files are for
coding agents (rules, commands, where things live). Both live next to the code they describe.
Decisions go in ADRs, not in chat threads. `just docs-check` verifies the mechanical parts.
