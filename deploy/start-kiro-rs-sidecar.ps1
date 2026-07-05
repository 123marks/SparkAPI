param(
    [ValidateSet("local", "named")]
    [string]$Mode = "local",

    [switch]$Pull,

    [switch]$BuildLocal,

    [switch]$NoStartSparkAPI
)

$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeBase = if ($Mode -eq "local") { "docker-compose.local.yml" } else { "docker-compose.yml" }
$composeSidecar = "docker-compose.kiro-rs.yml"
$composeLocalSource = "docker-compose.kiro-rs.local-src.yml"
$configDir = Join-Path $deployDir "kiro-rs\config"
$configPath = Join-Path $configDir "config.json"
$credentialsPath = Join-Path $configDir "credentials.json"
$configExamplePath = Join-Path $configDir "config.example.json"
$credentialsExamplePath = Join-Path $configDir "credentials.example.json"

function New-SecretKey {
    param(
        [Parameter(Mandatory = $true)][string]$Prefix
    )

    $bytes = [byte[]]::new(32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }

    $token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    return "$Prefix-$token"
}

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

function Read-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing required file: $Path"
    }

    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        throw "Invalid JSON in $Path. $($_.Exception.Message)"
    }
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )

    $json = $Value | ConvertTo-Json -Depth 20
    Set-Content -LiteralPath $Path -Value ($json + [Environment]::NewLine) -Encoding UTF8
}

function Assert-RequiredValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Field,
        [AllowNull()]$Value,
        [Parameter(Mandatory = $true)][string[]]$Placeholders
    )

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw "$Path is missing required value '$Field'."
    }

    foreach ($placeholder in $Placeholders) {
        if ($text -eq $placeholder -or $text.Contains($placeholder)) {
            throw "$Path field '$Field' still contains placeholder '$placeholder'. Fill in real values first."
        }
    }
}

function Initialize-KiroConfig {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    $config = Read-JsonFile -Path $Path
    $changed = $false

    if ([string]$config.apiKey -eq "sk-kiro-rs-change-me") {
        $config.apiKey = New-SecretKey -Prefix "sk-kiro-rs"
        $changed = $true
    }

    $adminProperty = $config.PSObject.Properties["adminApiKey"]
    if ($null -ne $adminProperty -and [string]$adminProperty.Value -eq "sk-kiro-rs-admin-change-me") {
        $config.adminApiKey = New-SecretKey -Prefix "sk-kiro-rs-admin"
        $changed = $true
    }

    if ($changed) {
        Write-JsonFile -Path $Path -Value $config
        Write-Warning "Generated random apiKey/adminApiKey in $(Resolve-Path -LiteralPath $Path). Keep this file private."
    }

    Assert-RequiredValue -Path $Path -Field "apiKey" -Value $config.apiKey -Placeholders @(
        "sk-kiro-rs-change-me"
    )

    if ($null -ne $adminProperty) {
        Assert-RequiredValue -Path $Path -Field "adminApiKey" -Value $config.adminApiKey -Placeholders @(
            "sk-kiro-rs-admin-change-me"
        )
    }

    return $config
}

function Assert-CredentialsReady {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    $rawCredentials = Read-JsonFile -Path $Path
    if ($rawCredentials -is [System.Array]) {
        $credentials = $rawCredentials
    } else {
        $credentials = @($rawCredentials)
    }

    if ($credentials.Count -eq 0) {
        throw "$Path must contain at least one Kiro credential."
    }

    $enabledCount = 0
    for ($index = 0; $index -lt $credentials.Count; $index++) {
        $credential = $credentials[$index]
        $disabledProperty = $credential.PSObject.Properties["disabled"]
        $disabled = $false
        if ($null -ne $disabledProperty) {
            $disabled = [System.Convert]::ToBoolean($disabledProperty.Value)
        }

        if ($disabled) {
            continue
        }

        $enabledCount++
        $label = "credentials[$index]"
        Assert-RequiredValue -Path $Path -Field "$label.refreshToken" -Value $credential.refreshToken -Placeholders @(
            "REPLACE_WITH_FULL_KIRO_REFRESH_TOKEN",
            "REPLACE_WITH_FULL_KIRO_IDC_REFRESH_TOKEN"
        )

        $authMethod = ([string]$credential.authMethod).ToLowerInvariant()
        if ($authMethod -eq "idc" -or $authMethod -eq "externalidp") {
            Assert-RequiredValue -Path $Path -Field "$label.clientId" -Value $credential.clientId -Placeholders @(
                "REPLACE_WITH_IDC_CLIENT_ID"
            )
            Assert-RequiredValue -Path $Path -Field "$label.clientSecret" -Value $credential.clientSecret -Placeholders @(
                "REPLACE_WITH_IDC_CLIENT_SECRET"
            )
        }
    }

    if ($enabledCount -eq 0) {
        throw "$Path has no enabled Kiro credentials. Add one account or set disabled=false on a configured entry."
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

    $config = Initialize-KiroConfig -Path $configPath
    Assert-CredentialsReady -Path $credentialsPath

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
    Write-Host "Config is persisted under deploy/kiro-rs/config. Do not copy example files again after editing."
} finally {
    Pop-Location
}
