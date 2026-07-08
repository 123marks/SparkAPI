param(
    [ValidateSet("local", "named")]
    [string]$Mode = "named",

    [switch]$Pull,

    [switch]$BuildLocal,

    [switch]$NoStartSparkAPI,

    [switch]$RequireCredentials
)

$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeBase = if ($Mode -eq "local") { "docker-compose.local.yml" } else { "docker-compose.yml" }
$composeSidecar = "docker-compose.kiro-rs.yml"
$composeLocalSource = "docker-compose.kiro-rs.local-src.yml"
$configDir = Join-Path $deployDir "kiro-rs\config"
$configPath = Join-Path $configDir "config.json"
$credentialsPath = Join-Path $configDir "credentials.json"
$clientKeysPath = Join-Path $configDir "client_api_keys.json"
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

function New-KiroClientKey {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".ToCharArray()
    $bytes = [byte[]]::new(32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }

    $body = -join ($bytes | ForEach-Object { $chars[[int]$_ % $chars.Length] })
    return "csk_$body"
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
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Invalid JSON in $Path. $($_.Exception.Message)"
    }
}

function Write-TextFileNoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )

    if ($Value -is [System.Array] -and $Value.Count -eq 0) {
        $json = "[]"
    } else {
        $json = $Value | ConvertTo-Json -Depth 20
    }
    Write-TextFileNoBom -Path $Path -Text ($json + [Environment]::NewLine)
}

function ConvertTo-JsonArray {
    param(
        [AllowNull()]$Value
    )

    if ($null -eq $Value) {
        return @()
    }

    if ($Value -is [System.Array]) {
        return @($Value)
    }

    return @($Value)
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

function Test-PlaceholderValue {
    param(
        [AllowNull()]$Value,
        [Parameter(Mandatory = $true)][string[]]$Placeholders
    )

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $false
    }

    foreach ($placeholder in $Placeholders) {
        if ($text -eq $placeholder -or $text.Contains($placeholder)) {
            return $true
        }
    }

    return $false
}

function Set-ObjectProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()]$Value
    )

    if ($null -ne $Object.PSObject.Properties[$Name]) {
        $Object.$Name = $Value
    } else {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
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

    Write-JsonFile -Path $Path -Value $config
    return $config
}

function Assert-CredentialsReady {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][bool]$RequireLiveCredential
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-JsonFile -Path $Path -Value @()
        Write-Warning "Created empty credentials.json. Start Kiro-RS, open /admin, then add Kiro accounts from the web panel."
    }

    $rawCredentials = Read-JsonFile -Path $Path
    if ($rawCredentials -is [System.Array]) {
        $credentials = $rawCredentials
    } else {
        $credentials = @($rawCredentials)
    }

    if ($credentials.Count -eq 0) {
        Write-JsonFile -Path $Path -Value @()
        if ($RequireLiveCredential) {
            throw "$Path must contain at least one Kiro credential."
        }
        Write-Warning "$Path has no credentials yet. Kiro-RS admin UI can still start; add Kiro accounts at http://127.0.0.1:8990/admin."
        return
    }

    $enabledCount = 0
    $changed = $false
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
        $refreshPlaceholders = @(
            "REPLACE_WITH_FULL_KIRO_REFRESH_TOKEN",
            "REPLACE_WITH_FULL_KIRO_IDC_REFRESH_TOKEN"
        )
        if (Test-PlaceholderValue -Value $credential.refreshToken -Placeholders $refreshPlaceholders) {
            if ($RequireLiveCredential) {
                Assert-RequiredValue -Path $Path -Field "$label.refreshToken" -Value $credential.refreshToken -Placeholders $refreshPlaceholders
            }
            Set-ObjectProperty -Object $credential -Name "disabled" -Value $true
            $changed = $true
            $enabledCount--
            Write-Warning "$Path $label is a placeholder sample. It was disabled so the Kiro-RS admin UI can start."
            continue
        }
        Assert-RequiredValue -Path $Path -Field "$label.refreshToken" -Value $credential.refreshToken -Placeholders $refreshPlaceholders

        $authMethod = ([string]$credential.authMethod).ToLowerInvariant()
        if ($authMethod -eq "idc" -or $authMethod -eq "externalidp") {
            $idcClientPlaceholders = @(
                "REPLACE_WITH_IDC_CLIENT_ID"
            )
            $idcSecretPlaceholders = @(
                "REPLACE_WITH_IDC_CLIENT_SECRET"
            )
            if (
                (Test-PlaceholderValue -Value $credential.clientId -Placeholders $idcClientPlaceholders) -or
                (Test-PlaceholderValue -Value $credential.clientSecret -Placeholders $idcSecretPlaceholders)
            ) {
                if ($RequireLiveCredential) {
                    Assert-RequiredValue -Path $Path -Field "$label.clientId" -Value $credential.clientId -Placeholders $idcClientPlaceholders
                    Assert-RequiredValue -Path $Path -Field "$label.clientSecret" -Value $credential.clientSecret -Placeholders $idcSecretPlaceholders
                }
                Set-ObjectProperty -Object $credential -Name "disabled" -Value $true
                $changed = $true
                $enabledCount--
                Write-Warning "$Path $label has IDC placeholder fields. It was disabled so the Kiro-RS admin UI can start."
                continue
            }
            Assert-RequiredValue -Path $Path -Field "$label.clientId" -Value $credential.clientId -Placeholders $idcClientPlaceholders
            Assert-RequiredValue -Path $Path -Field "$label.clientSecret" -Value $credential.clientSecret -Placeholders $idcSecretPlaceholders
        }
    }

    if ($changed) {
        Write-JsonFile -Path $Path -Value $credentials
    }

    if ($enabledCount -eq 0) {
        if ($RequireLiveCredential) {
            throw "$Path has no enabled Kiro credentials. Add one account or set disabled=false on a configured entry."
        }
        Write-Warning "$Path has no enabled Kiro credentials. Kiro-RS will start for admin setup, but Claude calls will fail until you add an account."
    }
}

function Ensure-SparkAPIClientKey {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-JsonFile -Path $Path -Value @()
        Write-Warning "Created client_api_keys.json. A dedicated SparkAPI client key will be generated."
    }

    $changed = $false
    try {
        $rawEntries = ConvertTo-JsonArray -Value (Read-JsonFile -Path $Path)
    } catch {
        $backupPath = "$Path.invalid-$(Get-Date -Format 'yyyyMMddHHmmss').bak"
        Copy-Item -LiteralPath $Path -Destination $backupPath -Force
        Write-Warning "client_api_keys.json is invalid. Backed it up to $(Split-Path -Leaf $backupPath) and regenerated the SparkAPI client key file."
        $rawEntries = @()
        $changed = $true
    }
    $entries = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $rawEntries) {
        [void]$entries.Add($entry)
    }
    $target = $null

    foreach ($entry in $entries) {
        $name = [string]$entry.name
        if ($name -eq "SparkAPI sidecar") {
            $target = $entry
            break
        }
    }

    if ($null -ne $target) {
        if (-not ([string]$target.key).StartsWith("csk_")) {
            $target.key = New-KiroClientKey
            $changed = $true
            Write-Warning "Rotated SparkAPI sidecar client key to the Kiro-RS csk_ format."
        }

        if ($target.disabled) {
            $target.disabled = $false
            $changed = $true
        }
    } else {
        $maxID = 0
        foreach ($entry in $entries) {
            $id = 0
            if ([int]::TryParse([string]$entry.id, [ref]$id) -and $id -gt $maxID) {
                $maxID = $id
            }
        }

        $target = [ordered]@{
            id = $maxID + 1
            key = New-KiroClientKey
            name = "SparkAPI sidecar"
            description = "Dedicated client key used by SparkAPI to call Kiro-RS. Generated by start-kiro-rs-sidecar.ps1."
            disabled = $false
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
            totalCalls = 0
            totalInputTokens = 0
            totalOutputTokens = 0
            totalCacheCreationTokens = 0
            totalCacheReadTokens = 0
            totalCredits = 0
            isSystem = $false
        }
        [void]$entries.Add([pscustomobject]$target)
        $changed = $true
        Write-Warning "Generated a dedicated Kiro-RS csk_ client key for SparkAPI."
    }

    if ($changed) {
        Write-JsonFile -Path $Path -Value $entries.ToArray()
    }

    if (-not ([string]$target.key).StartsWith("csk_")) {
        throw "$Path does not contain a valid csk_ client key for SparkAPI."
    }

    return [string]$target.key
}

Push-Location $deployDir
try {
    if (-not (Test-Path -LiteralPath ".env")) {
        Write-Warning "deploy\.env does not exist. Copy .env.example to .env and set POSTGRES_PASSWORD/JWT_SECRET before starting SparkAPI."
    }

    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    Copy-ExampleIfMissing -Source $configExamplePath -Target $configPath

    $config = Initialize-KiroConfig -Path $configPath
    Assert-CredentialsReady -Path $credentialsPath -RequireLiveCredential ([bool]$RequireCredentials)
    $sparkAPIClientKey = Ensure-SparkAPIClientKey -Path $clientKeysPath

    if ($config.host -ne "0.0.0.0") {
        throw "Kiro-RS config host must be 0.0.0.0 for Docker sidecar access. Current value: $($config.host)"
    }

    $env:KIRO_RS_API_KEY = $sparkAPIClientKey
    $env:KIRO_RS_INTERNAL_BASE_URL = "http://kiro-rs:8990"
    $env:KIRO_RS_PUBLIC_ADMIN_URL = "http://127.0.0.1:8990/admin"
    $env:KIRO_RS_SPARKAPI_ACCOUNT_BASE_URL = "http://kiro-rs:8990"

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
    Write-Host "Kiro-RS admin UI: http://127.0.0.1:8990/admin"
    Write-Host "Kiro-RS admin login key: value from kiro-rs/config/config.json adminApiKey"
    Write-Host "SparkAPI account base_url: http://kiro-rs:8990"
    Write-Host "SparkAPI account api_key: client key named 'SparkAPI sidecar' in kiro-rs/config/client_api_keys.json"
    Write-Host "SparkAPI status panel: Accounts -> More Actions -> Kiro-RS Admin"
    Write-Host "Flow: add Kiro accounts in Kiro-RS /admin, then connect SparkAPI to Kiro-RS as one Anthropic-compatible upstream."
    Write-Host "Config is persisted under deploy/kiro-rs/config. Do not copy example files again after editing."
} finally {
    Pop-Location
}
