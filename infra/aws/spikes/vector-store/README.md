# Vector store spike — throwaway stack (TRA-151)

Measures **candidate A, Qdrant as its own Lambda**, against **candidate B, Amazon S3
Vectors** (already in the main stack, ADR 0014). It exists to produce numbers for
`docs/architecture/vector-store-spike.md` and is **destroyed afterwards**.

Separate from the main stack on purpose:

- **Local state** (no S3 backend): `terraform destroy` here cannot reach production.
- Everything is tagged `spike=vector-store`, `issue=TRA-151`.
- It only ever **reads** the main stack's S3 Vectors index; it never creates or changes it.

## What it creates

| Resource | Why |
|---|---|
| ECR repository + one Lambda per memory size (1024, 2048 MB) | Candidate A: the Qdrant image, collection copied into `/tmp` at each cold start |
| A Function URL per Qdrant Lambda, `AuthType=AWS_IAM` | No key, no public endpoint: only a SigV4-signed caller gets in |
| One bench Lambda per size | Times both candidates from where `ai_api` runs (same Region, outside any VPC) |
| IAM | Bench may embed with Titan, `QueryVectors` on the one index, and invoke the Qdrant URLs. Nothing else |

Candidate B needs no compute: the bench calls the `s3vectors` API directly.

## Prerequisites

- `just aws-login` (an SSO session with rights to create these resources).
- Docker **on your machine** (the devcontainer has none).
- The embeddings artefact built once:
  `cd src/backend/tools/vector_store_bench && uv run python -m vector_store_bench -v embed`
  → `.artifacts/budapest/` (`vectors.npy`, `ids.json`, `manifest.json`).
- The main stack's index filled (TRA-152's `just index`), or candidate B has nothing to search.

## Apply

```bash
cd infra/aws/spikes/vector-store
terraform init                                    # local state, no backend config

# 1. The repository first: the Lambda needs an image that already exists.
terraform apply -target=aws_ecr_repository.qdrant
repo=$(terraform output -raw ecr_repository_url)

# 2. Build and push the Qdrant image (about 10 minutes: it indexes 6,082 points).
cd ../../../src/backend/tools
aws ecr get-login-password --region eu-west-1 \
  | docker login --username AWS --password-stdin "${repo%/*}"
# --provenance/--sbom off: buildx would otherwise wrap the image in an OCI index
# to attach attestations, and Lambda only accepts a plain Docker V2 schema 2
# manifest ("The image manifest, config or layer media type ... is not
# supported"). The same flags as .github/workflows/_build-image.yml.
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f vector_store_bench/qdrant_lambda/Dockerfile -t "${repo}:budapest" --push .

# 3. Package the bench function (a current boto3 travels in the zip: the runtime's
#    own boto3 has no s3vectors client).
./vector_store_bench/bench_lambda/build.sh

# 4. Everything else.
cd -
terraform apply
```

Building for `arm64` instead: pass `--platform linux/arm64` and
`-var architecture=arm64` (slightly cheaper per ms, but the build needs an arm64
machine or emulation).

## Measure

```bash
cd src/backend/tools/vector_store_bench
uv run python -m vector_store_bench latency --sizes 1024,2048   # invokes the bench functions
```

Each run writes `results/latency-*.csv`, which the report quotes. Cold numbers need a
fresh environment, so the command republishes an environment variable to force one.

## Destroy

```bash
cd infra/aws/spikes/vector-store
terraform destroy
```

Then say so in the report, with the date. Nothing here is meant to survive the spike.
