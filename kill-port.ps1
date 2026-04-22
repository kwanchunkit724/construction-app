# Kill any process holding port 5173, then wait until the port is free
$port = 5173

function Kill-Port {
    # Method 1: Get-NetTCPConnection -> taskkill /T (kills entire process tree)
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($p in $pids) {
            Write-Host "  Killing PID $p (tree)..." -ForegroundColor DarkGray
            & taskkill /PID $p /F /T 2>&1 | Out-Null
        }
    }

    # Method 2: netstat -ano fallback (catches anything Get-NetTCPConnection missed)
    $netstatLines = & netstat -ano 2>$null | Select-String ":$port\s"
    foreach ($line in $netstatLines) {
        $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
        $pidVal = $parts[-1]
        if ($pidVal -match '^\d+$' -and $pidVal -ne '0') {
            Write-Host "  Killing netstat PID $pidVal (tree)..." -ForegroundColor DarkGray
            & taskkill /PID $pidVal /F /T 2>&1 | Out-Null
        }
    }

    # Method 3: kill by window title
    & taskkill /FI "WINDOWTITLE eq Preview Server" /F /T 2>&1 | Out-Null
}

Write-Host "  Killing processes on port $port..." -ForegroundColor Gray
Kill-Port

# Wait until port is confirmed free — retry kill every 3 seconds (max 30 seconds)
$freed = $false
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Seconds 3
    $still = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $still) {
        $freed = $true
        break
    }
    Write-Host "  Port still in use, killing again ($i/10)..." -ForegroundColor DarkGray
    Kill-Port
}

if ($freed) {
    Write-Host "  Port $port is free." -ForegroundColor Green
} else {
    Write-Host "  ERROR: Could not free port $port after 30 seconds." -ForegroundColor Red
    Write-Host "  Please close the Preview Server window manually and re-run." -ForegroundColor Red
    exit 1
}
