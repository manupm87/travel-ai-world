# Runbook — versioning and releases

The version lives in `src/frontend/package.json` and is mirrored into every backend manifest
(`src/backend/pyproject.toml`, `libs/travel_common`, `services/core_api`, `services/ai_api`,
`tools/scraper`, `tools/city_corpus`) and `uv.lock`.

```bash
just version            # patch bump on a feature branch, commits the manifests
just version minor      # or major
# open a PR, merge to main, then:
just release            # tags vX.Y.Z and creates the GitHub release (needs gh)
```

Both recipes call `scripts/release.py` (plain Python, works in the devcontainer, on Windows and in CI).
