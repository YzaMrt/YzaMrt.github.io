param([switch]$NoBrowser, [switch]$Stop, [ValidateSet('Writer','Blog')][string]$Page = 'Writer')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskWriterUrl = 'http://127.0.0.1:4001'
function Get-WriterHealth {
    try { return Invoke-RestMethod -Uri ($taskWriterUrl + '/api/health') -TimeoutSec 2 } catch { return $null }
}
if ($Stop) {
    $taskHealth = Get-WriterHealth
    if ($taskHealth -and $taskHealth.app -eq 'yangz-wp-writer') {
        $taskSession = Invoke-RestMethod -Uri ($taskWriterUrl + '/api/session')
        Invoke-RestMethod -Method Post -Uri ($taskWriterUrl + '/api/stop') -Headers @{ 'X-Writer-Token' = $taskSession.token } -ContentType 'application/json' -Body '{}' | Out-Null
        Write-Output 'Local writer and blog stopped.'
    } else { Write-Output 'No local writer is running.' }
    exit
}
$taskHealth = Get-WriterHealth
if (-not $taskHealth -or $taskHealth.app -ne 'yangz-wp-writer') {
    $taskNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($taskNode) { $taskNodePath = $taskNode.Source } else {
        $taskNodePath = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node-*-win-x64\node.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $taskNodePath) { throw 'Node.js was not found. Install Node.js LTS, then try again.' }
    $taskLogs = Join-Path $taskRoot '.local'
    New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
    $taskStartFile = Join-Path $taskRoot 'tools\workbench.cjs'
    Start-Process -FilePath $taskNodePath -ArgumentList ('"' + $taskStartFile + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'workbench.log') -RedirectStandardError (Join-Path $taskLogs 'workbench.error.log') | Out-Null
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 25; $taskAttempt++) {
        Start-Sleep -Milliseconds 700
        $taskHealth = Get-WriterHealth
        if ($taskHealth -and $taskHealth.app -eq 'yangz-wp-writer') { $taskReady = $true; break }
    }
    if (-not $taskReady) { throw ('Startup failed. Read the log: ' + (Join-Path $taskLogs 'workbench.error.log')) }
}
if (-not $NoBrowser) {
    $taskUrl = if ($Page -eq 'Blog') { 'http://127.0.0.1:4000/' } else { $taskWriterUrl + '/' }
    Start-Process $taskUrl
}
Write-Output ('Writer: ' + $taskWriterUrl)
Write-Output 'Blog: http://127.0.0.1:4000/'
