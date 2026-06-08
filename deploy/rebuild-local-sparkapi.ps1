$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $deployDir
$binary = Join-Path $root "sub2api-linux-amd64"

function Test-HttpUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 5
    )

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
        if ($curl) {
            $curlOutput = & $curl.Source `
                --silent `
                --show-error `
                --location `
                --max-time $TimeoutSec `
                --connect-timeout $TimeoutSec `
                --output NUL `
                --write-out "%{http_code}" `
                $Url 2>&1

            $exitCode = $LASTEXITCODE
            $statusCode = 0
            $lastLine = @($curlOutput) | Select-Object -Last 1
            $hasStatusCode = $lastLine -and [int]::TryParse($lastLine.ToString(), [ref]$statusCode)

            return [pscustomobject]@{
                Url        = $Url
                Ok         = ($exitCode -eq 0 -and $hasStatusCode -and $statusCode -ge 200 -and $statusCode -lt 500)
                StatusCode = $(if ($hasStatusCode) { $statusCode } else { $null })
                DurationMs = $watch.ElapsedMilliseconds
                Error      = $(if ($exitCode -eq 0) { $null } else { (@($curlOutput) -join " ") })
            }
        }

        $job = Start-Job -ScriptBlock {
            param($RequestUrl, $RequestTimeout)
            Invoke-WebRequest -Uri $RequestUrl -UseBasicParsing -TimeoutSec $RequestTimeout -ErrorAction Stop
        } -ArgumentList $Url, $TimeoutSec

        $completed = Wait-Job -Job $job -Timeout ($TimeoutSec + 1)
        if (-not $completed) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
            throw "HTTP check timed out after $TimeoutSec second(s)"
        }

        $response = Receive-Job -Job $job -ErrorAction Stop
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        return [pscustomobject]@{
            Url        = $Url
            Ok         = $true
            StatusCode = [int]$response.StatusCode
            DurationMs = $watch.ElapsedMilliseconds
            Error      = $null
        }
    } catch {
        if ($job) {
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        }

        $statusCode = $null
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        return [pscustomobject]@{
            Url        = $Url
            Ok         = $false
            StatusCode = $statusCode
            DurationMs = $watch.ElapsedMilliseconds
            Error      = $_.Exception.Message
        }
    } finally {
        $watch.Stop()
    }
}

function Get-HttpText {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSec = 30
    )

    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        $content = & $curl.Source `
            --silent `
            --show-error `
            --location `
            --max-time $TimeoutSec `
            --connect-timeout 5 `
            $Url 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "curl failed for $Url`: $(@($content) -join ' ')"
        }
        return @($content) -join "`n"
    }

    return (Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec $TimeoutSec).Content
}

function Get-Sub2ApiFallbackCandidates {
    $urls = New-Object System.Collections.Generic.List[string]
    $urls.Add("http://127.0.0.1:8080")
    $urls.Add("http://localhost:8080")
    $urls.Add("http://172.26.16.1:8080")

    try {
        $preferredAdapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.InterfaceAlias -match "WSL|Docker|vEthernet|Hyper-V|HNS|Default Switch"
            } |
            Sort-Object @{ Expression = { if ($_.InterfaceAlias -match "WSL") { 0 } elseif ($_.InterfaceAlias -match "Docker") { 1 } else { 2 } } }, InterfaceAlias, IPAddress

        foreach ($adapter in $preferredAdapters) {
            $urls.Add(("http://{0}:8080" -f $adapter.IPAddress))
        }
    } catch {
        # Optional adapter discovery. The fixed WSL fallback covers the common
        # Docker Desktop localhost-forwarding failure.
    }

    return @($urls | Select-Object -Unique)
}

function Resolve-Sub2ApiBaseUrl {
    foreach ($baseUrl in Get-Sub2ApiFallbackCandidates) {
        $check = Test-HttpUrl "$baseUrl/health" 5
        if ($check.Ok) {
            return $baseUrl
        }
    }

    throw "sub2api health check failed on all local URLs: $((Get-Sub2ApiFallbackCandidates) -join ', ')"
}

function Invoke-InDir {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][scriptblock]$Script
    )

    Push-Location $Path
    try {
        & $Script
    } finally {
        Pop-Location
    }
}

Write-Host "Building SparkAPI frontend..."
Invoke-InDir (Join-Path $root "frontend") {
    pnpm run build
}

$commit = (git -C $root rev-parse --short HEAD).Trim()
$version = ((Get-Content -Path (Join-Path $root "backend\cmd\server\VERSION") -Raw).Trim() + "-sparkapi")
$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "Building Linux/amd64 backend binary..."
Invoke-InDir (Join-Path $root "backend") {
    $env:CGO_ENABLED = "0"
    $env:GOOS = "linux"
    $env:GOARCH = "amd64"
    $env:GOMAXPROCS = "4"
    go build -p 2 -tags embed `
        -ldflags="-s -w -X main.Version=$version -X main.Commit=$commit -X main.Date=$builtAt -X main.BuildType=release" `
        -trimpath `
        -o $binary `
        .\cmd\server
}

Write-Host "Repacking Docker image sub2api-whw:latest..."
Invoke-InDir $root {
    docker build -f deploy/Dockerfile.local-repack -t sub2api-whw:latest .
}

Write-Host "Recreating sub2api container only..."
Invoke-InDir $deployDir {
    docker compose -f docker-compose.yml up -d --no-deps --force-recreate sub2api
}

Write-Host "Checking service health..."
$baseUrl = $null
foreach ($attempt in 1..30) {
    try {
        $baseUrl = Resolve-Sub2ApiBaseUrl
        $health = Get-HttpText "$baseUrl/health" 10
        if ($health -match '"status"\s*:\s*"ok"') {
            break
        }
        $lastHealthError = "unexpected health response: $health"
    } catch {
        $lastHealthError = $_.Exception.Message
    }
    Start-Sleep -Seconds 2
}

if (-not $baseUrl -or $health -notmatch '"status"\s*:\s*"ok"') {
    throw "sub2api health check failed after retries: $lastHealthError"
}

Write-Host "Checking served frontend for removed import cap..."
$html = Get-HttpText "$baseUrl/" 30
$assets = [regex]::Matches($html, 'assets/[^"'']+\.js') | ForEach-Object { $_.Value } | Sort-Object -Unique
$needles = @(
    "Select at most 20 JSON files",
    "Select at most {max} JSON files",
    "dataImportTooManyFiles",
    "too_many_files",
    "ADMIN_DATA_IMPORT_MAX_FILES"
)

foreach ($asset in $assets) {
    $content = Get-HttpText "$baseUrl/$asset" 30
    foreach ($needle in $needles) {
        if ($content.Contains($needle)) {
            throw "Old import cap string still served from $asset`: $needle"
        }
    }
}

Write-Host "SparkAPI local rebuild complete."
Write-Host "URL: $baseUrl"
if ($baseUrl -ne "http://127.0.0.1:8080") {
    Write-Warning "127.0.0.1:8080 is not currently usable. Use $baseUrl, or run start-api-stack.ps1 -RepairLocalhostForwarding to refresh WSL localhost forwarding."
}
