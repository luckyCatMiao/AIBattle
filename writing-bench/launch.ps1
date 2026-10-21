$ErrorActionPreference = 'Stop'
$benchRoot = $PSScriptRoot
$benchPython = Join-Path $benchRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $benchPython)) {
    python -m venv (Join-Path $benchRoot '.venv')
    & $benchPython -m pip install -r (Join-Path $benchRoot 'requirements.txt')
}
$benchHealthy = $false
try {
    $benchConfig = Invoke-RestMethod -Uri 'http://127.0.0.1:8804/api/config' -TimeoutSec 2
    $benchHealthy = $benchConfig.judge -eq 'claude-opus-5-5'
} catch {}
if (-not $benchHealthy) {
    Start-Process -FilePath $benchPython -ArgumentList @('-u', (Join-Path $benchRoot 'server.py'), '--port', '8804') -WorkingDirectory $benchRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $benchRoot 'svg-server.log') -RedirectStandardError (Join-Path $benchRoot 'svg-server-error.log')
    for ($benchTry = 0; $benchTry -lt 30; $benchTry++) {
        try {
            $null = Invoke-RestMethod -Uri 'http://127.0.0.1:8804/api/config' -TimeoutSec 1
            break
        } catch { Start-Sleep -Milliseconds 300 }
    }
}
Start-Process 'http://127.0.0.1:8804/'
