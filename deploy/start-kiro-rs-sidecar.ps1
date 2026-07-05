$ErrorActionPreference = "Stop"

param(
    [ValidateSet("local", "named")]
    [string]$Mode = "local",

    [switch]$Pull,

    [switch]$BuildLocal,

    [switch]$NoStartSparkAPI
)

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeBase = if ($Mode -eq "local") { "docker-compose.local.yml" } else { "docker-compose.yml" }
$composeSidecar = "docker-compose.kiro-rs.yml"
$composeLocalSource = "docker-compose.kiro-rs.local-src.yml"
$configDir = Join-Path $deployDir "kiro-rs\config"
$configPath = Join-Path $configDir "config.json"
$credentialsPath = Join-Path $configDir "credentials.json"
$configExamplePath = Join-Path $configDir "config.example.json"
$credentialsExamplePath = Join-Path $configDir "credentials.example.json"

function Copy-ExampleIfMissing {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Target
    )

    if (-not (Test-Path -LiteralPath $Target)) {
        Copy-Item -LiteralPath $Source -Destination $Target
        Write-Warning "Created $(Split-Path -Leaf $Target) from example. Edit it before using real Kiro accounts."
    }
}

function Assert-FileReady {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Placeholders
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing required file: $Path"
    }

    $content = Get-Content -LiteralPath $Path -Raw
    foreach ($placeholder in $Placeholders) {
        if ($content.Contains($placeholder)) {
            throw "$Path still contains placeholder '$placeholder'. Fill in real values first."
        }
    }
}

Push-Location $deployDir
try {
    if (-not (Test-Path -LiteralPath ".env")) {
        Write-Warning "deploy\.env does not exist. Copy .env.example to .env and set POSTGRES_PASSWORD/JWT_SECRET before starting SparkAPI."
    }

    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    Copy-ExampleIfMissing -Source $configExamplePath -Target $configPath
    Copy-ExampleIfMissing -Source $credentialsExamplePath -Target $credentialsPath

    Assert-FileReady -Path $configPath -Placeholders @(
        "sk-kiro-rs-change-me",
        "sk-kiro-rs-admin-change-me"
    )
    Assert-FileReady -Path $credentialsPath -Placeholders @(
        "REPLACE_WITH_FULL_KIRO_REFRESH_TOKEN",
        "REPLACE_WITH_FULL_KIRO_IDC_REFRESH_TOKEN",
        "REPLACE_WITH_IDC_CLIENT_ID",
        "REPLACE_WITH_IDC_CLIENT_SECRET"
    )

    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.host -ne "0.0.0.0") {
        throw "Kiro-RS config host must be 0.0.0.0 for Docker sidecar access. Current value: $($config.host)"
    }

    $env:KIRO_RS_API_KEY = [string]$config.apiKey

    $services = @()
    if (-not $NoStartSparkAPI) {
        $services += "sub2api"
    }
    $services += "kiro-rs"

    $composeArgs = @("-f", $composeBase, "-f", $composeSidecar)
    if ($BuildLocal) {
        $composeArgs += @("-f", $composeLocalSource)
    }
    $composeArgs += @("--profile", "kiro-rs")

    if ($Pull) {
        docker compose @composeArgs pull kiro-rs
    }

    $upArgs = @("compose") + $composeArgs + @("up", "-d")
    if ($BuildLocal) {
        $upArgs += "--build"
    }
    $upArgs += $services
    docker @upArgs

    Write-Host ""
    Write-Host "Kiro-RS sidecar started."
    Write-Host "Host URL: http://127.0.0.1:8990"
    Write-Host "SparkAPI account base_url: http://kiro-rs:8990"
    Write-Host "SparkAPI account api_key: value from kiro-rs/config/config.json apiKey"
} finally {
    Pop-Location
}
