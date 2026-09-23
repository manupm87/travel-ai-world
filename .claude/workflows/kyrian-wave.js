export const meta = {
  name: 'kyrian-wave',
  description: 'Deliver one Linear issue: Opus implements in a worktree and opens the PR, Sonnet reviews with three lenses, Opus fixes and watches CI',
  whenToUse: 'A feature or fix whose brief (decisions, files, tests, docs) is already written. Args: {issue, branch, briefPath, checks?, base?}. Not for docs-only edits or one-line fixes.',
  phases: [
    { title: 'Implement', detail: 'one Opus 5.5 agent, git worktree, opens the PR', model: 'claude-opus-5-5' },
    { title: 'Review', detail: 'three Sonnet 5 reviewers, one lens each', model: 'claude-sonnet-5' },
    { title: 'Fix', detail: 'one Opus 5.5 agent applies confirmed findings and watches CI', model: 'claude-opus-5-5' },
  ],
}

// ── Inputs ────────────────────────────────────────────────────────────────────
// args.issue     "TRA-199"
// args.branch    "feat/TRA-199-my-trips-home"  (<type>/TRA-<n>-<slug>, checked by the hook)
// args.briefPath absolute path of the brief the main session wrote (decisions, files, tests, docs)
// args.checks    commands that must be green before the PR (default below)
// args.base      base branch (default "main")
if (!args || !args.issue || !args.branch || !args.briefPath) {
  throw new Error('kyrian-wave needs args {issue, branch, briefPath}')
}
const issue = args.issue
const branch = args.branch
const brief = args.briefPath
const base = args.base || 'main'
const checks = args.checks || ['just lint', 'just test-frontend', 'just test-e2e-static']

const RULES = `
Ground rules (the repo's AGENTS.md files apply; these are the ones a wave trips on):
- You work in a fresh git worktree. First: git fetch origin, then create or check out the branch as told.
  Frontend work needs the worktree's own node_modules: cd src/frontend && npm ci. Backend work: uv sync.
- Never touch .claude/, docs/api/, src/frontend/src/types/generated/, lockfiles, or src/backend/tools/scraper/.
- Every commit is conventional and ends with the trailer line:
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- Push with: git push -u origin ${branch}
- Your final text is data for the orchestrator, not a message for a person.`

// ── Implement ────────────────────────────────────────────────────────────────
phase('Implement')
const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    pr: { type: 'string', description: 'PR URL, or "" if none could be opened' },
    branch: { type: 'string' },
    headSha: { type: 'string' },
    summary: { type: 'string' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'where you departed from the brief and why' },
    checksRun: { type: 'array', items: { type: 'string' } },
    blocked: { type: 'string', description: 'what stopped you, or ""' },
  },
  required: ['pr', 'branch', 'headSha', 'summary', 'deviations', 'checksRun', 'blocked'],
}
const impl = await agent(
  `Implement Linear issue ${issue} on branch ${branch} (from origin/${base}) and open its PR.
The brief is at ${brief}: read it first with cat, then the files it names. Follow every decision in it;
if one is impossible, do the closest thing and list it under deviations.
Steps: git fetch origin, then create the branch from origin/${base} with git switch -c ${branch} origin/${base}
(the name is checked by a hook); install as the brief says; implement, with the tests and the docs the brief
lists; run each of these and make them green: ${checks.join(' ; ')}; commit in small conventional commits;
push; open the PR with gh pr create --base ${base} --title "<conventional title> (${issue})" --body-file <a file
following .github/pull_request_template.md>, the body ending with "Closes ${issue}" and the line
"🤖 Generated with [Claude Code](https://claude.com/claude-code)".
${RULES}`,
  { label: `implement:${issue}`, phase: 'Implement', model: 'claude-opus-5-5', isolation: 'worktree', schema: IMPL_SCHEMA },
)
if (!impl || !impl.pr) {
  log(`Implementation did not open a PR (${impl ? impl.blocked : 'agent died'}); stopping here.`)
  return { stage: 'implement', impl }
}
log(`PR open: ${impl.pr}`)

// ── Review ───────────────────────────────────────────────────────────────────
phase('Review')
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['blocker', 'should', 'nit'] },
          title: { type: 'string' },
          detail: { type: 'string', description: 'why it is wrong and what to change' },
        },
        required: ['file', 'severity', 'title', 'detail'],
      },
    },
    verdict: { type: 'string', enum: ['approve', 'request-changes'] },
  },
  required: ['findings', 'verdict'],
}
const LENSES = [
  { key: 'correctness', prompt: 'Correctness and state: broken flows, wrong redirects, stale state, race conditions, error paths, anything the tests would not catch. Run the unit tests of the touched packages yourself.' },
  { key: 'contract-tests', prompt: 'Contracts and tests: does the change keep the rules in AGENTS.md (service boundary, domain errors, i18n through useLanguage, no direct fetch in components, generated files untouched, docs travel with the change)? Are the tests real (they fail without the change) and is the e2e coverage the brief asked for present?' },
  { key: 'ux-a11y', prompt: 'UX, copy and accessibility: does the page match the brief and docs/design/kyrian-world.md (palette, motion, copy rules), phone width (390 px, no horizontal scroll), keyboard and screen-reader paths (labels, roles, focus), both languages (en and es) complete and natural.' },
]
const reviews = (await parallel(
  LENSES.map((lens) => () =>
    agent(
      `Review PR ${impl.pr} (branch ${branch}, issue ${issue}) through ONE lens — ${lens.key}.
${lens.prompt}
Read the brief at ${brief} so you know what was asked. Get the diff with: gh pr diff ${impl.pr}.
To read whole files: git fetch origin ${branch} && git show origin/${branch}:<path>, or check the branch out
in a worktree of your own (git worktree add). Report only what you verified in the code; a finding names
file and line and says what to change. Severity: blocker = wrong behaviour or a broken rule; should = real
but not blocking; nit = style.
${RULES}`,
      { label: `review:${lens.key}`, phase: 'Review', model: 'claude-sonnet-5', schema: FINDINGS_SCHEMA },
    ),
  ),
)).filter(Boolean)
const findings = reviews.flatMap((r) => r.findings)
const actionable = findings.filter((f) => f.severity !== 'nit')
log(`Review: ${findings.length} findings, ${actionable.length} actionable (${reviews.map((r) => r.verdict).join(', ')})`)

// ── Fix ──────────────────────────────────────────────────────────────────────
phase('Fix')
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    pr: { type: 'string' },
    headSha: { type: 'string' },
    ci: { type: 'string', enum: ['green', 'red', 'pending', 'unknown'] },
    applied: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'finding → why it was not applied' },
    notes: { type: 'string' },
  },
  required: ['pr', 'headSha', 'ci', 'applied', 'skipped', 'notes'],
}
const fix = await agent(
  `Finish PR ${impl.pr} (branch ${branch}, issue ${issue}).
Check the branch out: git fetch origin && git switch -c ${branch} origin/${branch}; install as the brief (${brief}) says.
Findings from three reviewers (JSON): ${JSON.stringify(actionable)}
Nits, for your judgement only: ${JSON.stringify(findings.filter((f) => f.severity === 'nit'))}
Apply every finding you can confirm in the code; skip one only with a reason. Re-run ${checks.join(' ; ')}.
Commit, push, then watch CI on the pushed head: gh pr checks ${impl.pr} --watch (up to two rounds of fixes if a
job fails — read the failing job's log with gh run view <id> --log-failed). Do NOT merge.
${RULES}`,
  { label: `fix:${issue}`, phase: 'Fix', model: 'claude-opus-5-5', isolation: 'worktree', schema: FIX_SCHEMA },
)

return { pr: impl.pr, branch, impl, findings, fix }
