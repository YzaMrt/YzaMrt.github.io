param([string]$Message = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($taskNode) { $taskNodePath = $taskNode.Source } else {
    $taskNodePath = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node-*-win-x64\node.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $taskNodePath) { throw 'Node.js was not found. Install Node.js LTS, then try again.' }
$taskScript = Join-Path $PSScriptRoot 'publish.cjs'
if ($Message) { & $taskNodePath $taskScript --root $taskRoot --message $Message }
else { & $taskNodePath $taskScript --root $taskRoot }
exit $LASTEXITCODE
