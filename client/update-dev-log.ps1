# Simple PowerShell script to help update development tracking files
# Run with: .\update-dev-log.ps1 "Description of change"

param(
    [Parameter(Mandatory=$true)]
    [string]$Description
)

function Get-CurrentDate {
    return Get-Date -Format "yyyy-MM-dd"
}

function Update-Changelog {
    param([string]$Description)

    $changelogPath = ".\CHANGELOG.md"
    if (Test-Path $changelogPath) {
        $content = Get-Content $changelogPath -Raw

        # Find the [Unreleased] section
        if ($content -match "(## \[Unreleased\])((?:(?!## \[).)*)") {
            $unreleasedSection = $matches[2]
            if ($unreleasedSection.Trim() -ne "") {
                $updatedSection = $unreleasedSection.TrimEnd() + "`n- $Description`n"
            } else {
                $updatedSection = "`n- $Description`n"
            }

            $content = $content -replace "(## \[Unreleased\])((?:(?!## \[).)*)", "`$1$updatedSection"
            Set-Content $changelogPath $content
            Write-Host "Updated CHANGELOG.md"
        } else {
            Write-Host "Could not find [Unreleased] section in CHANGELOG.md"
        }
    } else {
        Write-Host "CHANGELOG.md not found"
    }
}

function Update-DevelopmentLog {
    param([string]$Description)

    $devLogPath = ".\DEVELOPMENT.md"
    if (Test-Path $devLogPath) {
        $content = Get-Content $devLogPath -Raw

        # Find the Current Tasks section
        if ($content -match "(## Ongoing Development\s+### Recently Completed\s+(?:- \[x\] .*\s)*\s+### Current Tasks\s+)((?:- \[ \] .*\s)*)") {
            $beforeTasks = $matches[1]
            $currentTasks = $matches[2]
            $updatedTasks = "- [ ] $Description`n$currentTasks"

            $content = $content -replace "(## Ongoing Development\s+### Recently Completed\s+(?:- \[x\] .*\s)*\s+### Current Tasks\s+)((?:- \[ \] .*\s)*)", "`$1$updatedTasks"
            Set-Content $devLogPath $content
            Write-Host "Updated DEVELOPMENT.md"
        } else {
            Write-Host "Could not find Current Tasks section in DEVELOPMENT.md"
        }
    } else {
        Write-Host "DEVELOPMENT.md not found"
    }
}

# Main execution
$timestamp = Get-CurrentDate
$datedDescription = "$Description ($timestamp)"

Update-Changelog $datedDescription
Update-DevelopmentLog $Description

Write-Host "`nAdded to development logs:"
Write-Host "- $datedDescription"