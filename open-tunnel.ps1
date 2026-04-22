param(
    [string]$CloudflaredPath
)

# ── 1. Detect which port vite preview is listening on (polls 5173-5182) ──────
# Vite is started by start-with-tunnel.bat before this script runs.
# Node.js buffers stdout when not a TTY, so we probe TCP directly instead.

Write-Host ">>> Waiting for vite preview to start..." -ForegroundColor Gray
$detectedPort = $null
$portsToCheck = 5173..5182

for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    foreach ($port in $portsToCheck) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $port)
            $tcp.Close()
            $detectedPort = $port
            break
        } catch { }
    }
    if ($detectedPort) { break }
    Write-Host "  Waiting for vite... ($i/30)" -ForegroundColor DarkGray
}

if (-not $detectedPort) {
    Write-Host "ERROR: Could not detect vite port after 30 seconds." -ForegroundColor Red
    exit 1
}

Write-Host ">>> Vite is running on port $detectedPort" -ForegroundColor Green

# ── 2. Start cloudflared tunnel using detected port ──────────────────────────
Write-Host ""
Write-Host ">>> Starting Cloudflare tunnel on http://localhost:$detectedPort ..." -ForegroundColor Gray
Write-Host ""

$opened = $false

& $CloudflaredPath tunnel --url "http://localhost:$detectedPort" 2>&1 | ForEach-Object {
    Write-Host $_

    if (-not $opened -and $_ -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
        $tunnelUrl      = [regex]::Match($_, 'https://[a-z0-9\-]+\.trycloudflare\.com').Value
        $tunnelHostname = ([System.Uri]$tunnelUrl).Host

        Write-Host ""
        Write-Host ">>> URL detected: $tunnelUrl" -ForegroundColor Yellow

        # Step 1: wait for DNS to resolve
        Write-Host ">>> Step 1/2: Waiting for DNS..." -ForegroundColor Gray
        $dnsReady = $false
        for ($i = 1; $i -le 40; $i++) {
            try {
                $null = [System.Net.Dns]::GetHostAddresses($tunnelHostname)
                $dnsReady = $true
                break
            } catch {
                Write-Host "  DNS attempt $i/40..." -ForegroundColor DarkGray
                Start-Sleep -Seconds 2
            }
        }

        if (-not $dnsReady) {
            Write-Host ">>> DNS timed out. Open manually: $tunnelUrl" -ForegroundColor Red
            $opened = $true
            return
        }
        Write-Host ">>> DNS resolved." -ForegroundColor Green

        # Step 2: wait for HTTP to actually respond (tunnel fully ready)
        Write-Host ">>> Step 2/2: Waiting for tunnel HTTP..." -ForegroundColor Gray
        $httpReady = $false
        for ($j = 1; $j -le 20; $j++) {
            try {
                $req = [System.Net.HttpWebRequest]::Create($tunnelUrl)
                $req.Timeout = 4000
                $req.AllowAutoRedirect = $true
                $req.ServerCertificateValidationCallback = { $true }
                $resp = $req.GetResponse()
                $resp.Close()
                $httpReady = $true
                break
            } catch [System.Net.WebException] {
                if ($_.Exception.Response -ne $null) {
                    $httpReady = $true
                    break
                }
                Write-Host "  HTTP attempt $j/20..." -ForegroundColor DarkGray
                Start-Sleep -Seconds 2
            } catch {
                Write-Host "  HTTP attempt $j/20..." -ForegroundColor DarkGray
                Start-Sleep -Seconds 2
            }
        }

        Write-Host ""
        if ($httpReady) {
            Write-Host ">>> Tunnel ready! Opening browser..." -ForegroundColor Green
        } else {
            Write-Host ">>> HTTP check timed out, opening anyway..." -ForegroundColor Yellow
        }
        Start-Process $tunnelUrl

        $opened = $true
    }
}
