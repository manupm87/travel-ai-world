<#
.SYNOPSIS
    Bump the project version across all manifests.
.DESCRIPTION
    Reads the current version from frontend/package.json (single source of truth),
    bumps it (patch/minor/major), and synchronizes the new version to all manifests.
    Then stages the files and creates a local commit.

    This script is meant to be run on a FEATURE branch before pushing.
    It will ABORT if you are on main/master.
    It will NOT push — only creates a local commit.

    Files synchronized:
      - frontend/package.json    (source of truth)
      - backend/pyproject.toml

.PARAMETER Bump
    Version bump type: "patch" (0.0.X), "minor" (0.X.0), or "major" (X.0.0).
    Default: "patch".
.PARAMETER NoCommit
    If set, modifies files but does NOT create a git commit.
.EXAMPLE
    .\scripts\new_version.ps1                  # patch bump + commit
    .\scripts\new_version.ps1 -Bump minor      # minor bump + commit
    .\scripts\new_version.ps1 -NoCommit        # patch bump, no commit
#>
param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [switch]$NoCommit
)

$ErrorActionPreference = "Stop"

# ── Always run from repo root ────────────────────────────────
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ── Branch protection: abort if on main/master ───────────────
$currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
    Write-Host ""
    Write-Host "ERROR: You are on '$currentBranch'." -ForegroundColor Red
    Write-Host "Version bumps must be done on a feature/fix branch, not on the main branch." -ForegroundColor Red
    Write-Host "Create a branch first:  git checkout -b chore/bump-version" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── All manifest files that must stay in sync ────────────────
# Type: "json" for package.json, "toml" for pyproject.toml
$ManifestFiles = @(
    @{ File = "frontend/package.json";    Type = "json"; Label = "frontend (package.json)" }
    @{ File = "backend/pyproject.toml";   Type = "toml"; Label = "backend (pyproject.toml)" }
)

# ── Helper: read version from a manifest file ───────────────
function Get-ManifestVersion {
    param([string]$FilePath, [string]$Type)
    $content = Get-Content $FilePath -Raw
    if ($Type -eq "toml") {
        if ($content -match 'version\s*=\s*"(\d+\.\d+\.\d+)"') {
            return $Matches[1]
        }
    } elseif ($Type -eq "json") {
        $json = $content | ConvertFrom-Json
        return $json.version
    }
    throw "Could not parse version from $FilePath"
}

# ── Helper: write version to a manifest file ────────────────
function Set-ManifestVersion {
    param([string]$FilePath, [string]$Type, [string]$OldVersion, [string]$NewVersion)
    $content = Get-Content $FilePath -Raw
    if ($Type -eq "toml") {
        $content = $content -replace "version\s*=\s*`"$OldVersion`"", "version = `"$NewVersion`""
    } elseif ($Type -eq "json") {
        $content = $content -replace "`"version`":\s*`"$OldVersion`"", "`"version`": `"$NewVersion`""
    }
    Set-Content -Path $FilePath -Value $content -NoNewline
}

# ── Helper: calculate new version ────────────────────────────
function Get-BumpedVersion {
    param([string]$Version, [string]$BumpType)
    $parts = $Version -split '\.'
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($BumpType) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }
    return "$major.$minor.$patch"
}

# ── Step 1: Read current version from frontend/package.json ──
$sourceManifest = Join-Path $repoRoot "frontend/package.json"
$oldVersion = Get-ManifestVersion -FilePath $sourceManifest -Type "json"
$newVersion = Get-BumpedVersion -Version $oldVersion -BumpType $Bump

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "  Version Bump: $oldVersion → $newVersion ($Bump)" -ForegroundColor Cyan
Write-Host "  Branch: $currentBranch" -ForegroundColor DarkGray
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

# ── Step 2: Update all manifest files ────────────────────────
$updatedFiles = @()

foreach ($manifest in $ManifestFiles) {
    $filePath = Join-Path $repoRoot $manifest.File
    if (-not (Test-Path $filePath)) {
        Write-Host "  SKIP  $($manifest.Label) — file not found" -ForegroundColor Yellow
        continue
    }

    $currentVersion = Get-ManifestVersion -FilePath $filePath -Type $manifest.Type
    Set-ManifestVersion -FilePath $filePath -Type $manifest.Type -OldVersion $currentVersion -NewVersion $newVersion
    Write-Host "  ✔ $($manifest.Label): $currentVersion → $newVersion" -ForegroundColor Green
    $updatedFiles += $manifest.File
}

# ── Step 3: Stage and commit (unless -NoCommit) ─────────────
Write-Host ""
if (-not $NoCommit -and $updatedFiles.Count -gt 0) {
    git add $updatedFiles
    $commitMsg = "🔖 chore: bump version to $newVersion"
    git commit -m $commitMsg
    Write-Host "Committed: $commitMsg" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Push your branch:  git push" -ForegroundColor White
    Write-Host "  2. Create a PR and merge to main" -ForegroundColor White
    Write-Host "  3. After merge, run:  .\tasks.ps1 release" -ForegroundColor White
} elseif ($NoCommit) {
    Write-Host "Files updated (no commit created — -NoCommit was set)." -ForegroundColor Yellow
    Write-Host "Stage and commit manually when ready." -ForegroundColor DarkGray
} else {
    Write-Host "No files were updated." -ForegroundColor Yellow
}
Write-Host ""
