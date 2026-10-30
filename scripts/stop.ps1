$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.local/app-processes.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded application processes.'; exit 0 }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
foreach ($processId in @($record.web,$record.api)) {
 $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
 if ($process -and $process.CommandLine -and $process.CommandLine.Contains($projectRoot)) { Stop-Process -Id $processId }
 elseif ($process) { throw "PID $processId does not belong to this project; left running." }
}
Remove-Item -LiteralPath $pidFile
Write-Output 'InpaCare application stopped. PostgreSQL remains running; scripts/database.ps1 -Action stop stops it.'
