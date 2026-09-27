# Documentation

| Where | What |
|---|---|
| [architecture/overview.md](architecture/overview.md) | System diagram, request flows, service boundaries, [AWS target diagram](architecture/aws-architecture.drawio.svg) (draw.io, editable in VS Code) |
| [architecture/adr/](architecture/adr/README.md) | Architecture Decision Records (why things are the way they are) |
| [architecture/code-quality-review-2026-09-27.md](architecture/code-quality-review-2026-09-27.md) | The latest code and architecture audit (Spanish): findings, fixes applied, decisions pending; the [2026-09-07 review](architecture/code-quality-review.md) is historical |
| [architecture/vector-store-spike.md](architecture/vector-store-spike.md) | Qdrant vs S3 Vectors, measured (TRA-151): the input to ADR 0014 |
| [runbooks/](runbooks/local-dev.md) | How to run, ship and release: [local-dev](runbooks/local-dev.md), [docker](runbooks/docker.md), [deploy](runbooks/deploy.md), [release](runbooks/release.md), [add-city](runbooks/add-city.md), [agent-delivery](runbooks/agent-delivery.md); [frontend-https-aws](runbooks/frontend-https-aws.md) is historical |
| [api/](api/) | Generated OpenAPI documents (`core-api`, `ai-api`) — source of the frontend's types |
| [design/](design/) | [`kyrian-world.md`](design/kyrian-world.md), the design reference (palette, type, Kiri); `ideas.pen`, the Pencil design file |
| [memoria/](memoria/README.md) | The project report (LaTeX, Spanish): product, market, architecture, AI/RAG, cloud, process, critical review |

Conventions: `README.md` files are for people (what it is, how to run it); `AGENTS.md` files are for
coding agents (rules, commands, where things live). Both live next to the code they describe.
Decisions go in ADRs, not in chat threads. `just docs-check` verifies the mechanical parts.
