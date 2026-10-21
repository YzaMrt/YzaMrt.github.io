param([string]$Message = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) {
    $found = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $found) { throw 'Git not found. Install Git for Windows and try again.' }
    $git = $found.Source
}

if (-not (Test-Path (Join-Path $root '.git'))) { throw 'This folder is not a git repository.' }

& $git add -A
$tree = (& $git write-tree).Trim()
$headTree = ''
try { $headTree = (& $git rev-parse 'HEAD^{tree}' 2>$null).Trim() } catch { }
if ($tree -eq $headTree) {
    Write-Output 'No changes to publish.'
    exit 0
}

if (-not $Message) { $Message = 'Update blog ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
$commit = (& $git commit-tree $tree -m $Message).Trim()
if ($LASTEXITCODE -ne 0 -or -not $commit) { throw 'Commit failed. Check the message above.' }
& $git update-ref refs/heads/main $commit
if ($LASTEXITCODE -ne 0) { throw 'Could not update the local branch.' }

& $git push --force origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed. If GitHub asks you to sign in, finish it in the browser and run this again.' }

Write-Output ''
Write-Output 'Published. GitHub keeps only the current content, so deleted posts stay gone.'
Write-Output 'Live site:   https://yzamrt.github.io/'
Write-Output 'Build runs:  https://github.com/YzaMrt/YzaMrt.github.io/actions'
