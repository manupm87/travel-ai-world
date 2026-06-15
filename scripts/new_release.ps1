<#
.SYNOPSIS
    Create a GitHub Release from the current project version.
.DESCRIPTION
    This script is run AFTER a PR has been merged into main/master and the
    merge pipeline is green. It:
      1. Switches to main/master (if not already there)
      2. Pulls the latest merged changes
      3. Verifies the working tree is clean
      4. Reads the version from frontend/package.json
      5. Creates a git tag (vX.X.X)
      6. Creates a GitHub Release with auto-generated changelog

    It does NOT create code commits — only tags and releases.
    Requires the GitHub CLI (gh) to be installed and authenticated.

.PARAMETER PreRelease
    Mark the release as a pre-release.
.PARAMETER Draft
    Create the release as a draft (requires manual publish on GitHub).
.EXAMPLE
    .\scripts\new_release.ps1
    .\scripts\new_release.ps1 -PreRelease
    .\scripts\new_release.ps1 -Draft
#>
param(
    [switch]$PreRelease,
    [switch]$Draft
)

$ErrorActionPreference = "Stop"

# ── Require GitHub CLI ───────────────────────────────────────
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: GitHub CLI (gh) is required but not installed." -ForegroundColor Red
    Write-Host "Install it: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── Always run from repo root ────────────────────────────────
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ── Detect the main branch name (main or master) ────────────
$currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
$mainBranch = $null

if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
    $mainBranch = $currentBranch
} else {
    $remoteBranches = git branch -r 2>$null
    if ($remoteBranches -match "origin/main") {
        $mainBranch = "main"
    } elseif ($remoteBranches -match "origin/master") {
        $mainBranch = "master"
    } else {
        Write-Host "ERROR: Could not detect main/master branch on remote." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow
    Write-Host "Switching to '$mainBranch' before releasing..." -ForegroundColor Cyan

    $status = git status --porcelain 2>$null
    if ($status) {
        Write-Host ""
        Write-Host "ERROR: Uncommitted changes detected:" -ForegroundColor Red
        Write-Host $status -ForegroundColor Gray
        Write-Host "Commit or stash your changes before releasing." -ForegroundColor Red
        exit 1
    }

    git checkout $mainBranch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to switch to '$mainBranch'." -ForegroundColor Red
        exit 1
    }
    Write-Host "Switched to '$mainBranch'." -ForegroundColor Green
}

# ── Pull latest changes ─────────────────────────────────────
Write-Host ""
Write-Host "Pulling latest changes from origin/$mainBranch..." -ForegroundColor Cyan
git pull origin $mainBranch
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull. Resolve any conflicts and try again." -ForegroundColor Red
    exit 1
}
Write-Host "Up to date with origin/$mainBranch." -ForegroundColor Green

# ── Verify clean working tree ────────────────────────────────
$status = git status --porcelain 2>$null
if ($status) {
    Write-Host ""
    Write-Host "ERROR: Working tree is not clean after pull:" -ForegroundColor Red
    Write-Host $status -ForegroundColor Gray
    Write-Host "Resolve the issues before creating a release." -ForegroundColor Red
    exit 1
}

# ── Read version from frontend/package.json ──────────────────
$packageJsonPath = Join-Path $repoRoot "frontend/package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = $packageJson.version

if (-not ($version -match '^\d+\.\d+\.\d+$')) {
    Write-Host "ERROR: Invalid version '$version' in package.json. Expected semver (X.X.X)." -ForegroundColor Red
    exit 1
}

$tag = "v$version"

# ── Check tag doesn't already exist ─────────────────────────
$existingTag = git tag -l $tag 2>$null
if ($existingTag) {
    Write-Host ""
    Write-Host "ERROR: Tag '$tag' already exists." -ForegroundColor Red
    Write-Host "Bump the version first on your feature branch:" -ForegroundColor Yellow
    Write-Host "  .\scripts\new_version.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

# ── Summary before creating release ─────────────────────────
$releaseType = if ($PreRelease) { "Pre-release" } elseif ($Draft) { "Draft" } else { "Stable" }

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "  Creating Release" -ForegroundColor Cyan
Write-Host "  Branch  : $mainBranch" -ForegroundColor White
Write-Host "  Version : $version" -ForegroundColor White
Write-Host "  Tag     : $tag" -ForegroundColor White
Write-Host "  Type    : $releaseType" -ForegroundColor White
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

# ── Create GitHub Release (gh handles tag creation) ──────────
$ghArgs = @("release", "create", $tag, "--generate-notes", "--title", "Release $tag")
if ($PreRelease) { $ghArgs += "--prerelease" }
if ($Draft)      { $ghArgs += "--draft" }

Write-Host "Creating GitHub release..." -ForegroundColor Cyan
gh @ghArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✔ Release $tag created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "View it at:" -ForegroundColor DarkGray
    gh release view $tag --json url --jq '.url' 2>$null
    Write-Host ""
} else {
    Write-Host "ERROR: Failed to create release." -ForegroundColor Red
    exit 1
}
