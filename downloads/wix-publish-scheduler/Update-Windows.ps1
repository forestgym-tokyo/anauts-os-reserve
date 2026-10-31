[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ReleaseRef,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{64}$')]
  [string]$ExpectedZipSha256,
  [string]$ProjectFolder = '',
  [string]$NotificationEmail = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-WixUtf8([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Get-WixSourceHash([string]$Path) {
  $WixText = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $WixText = $WixText.TrimStart([char]0xFEFF).Replace("`r`n", "`n").TrimEnd([char[]]"`r`n")
  $WixHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $WixBytes = [System.Text.Encoding]::UTF8.GetBytes($WixText)
    return [System.BitConverter]::ToString($WixHasher.ComputeHash($WixBytes)).Replace('-', '').ToLowerInvariant()
  } finally { $WixHasher.Dispose() }
}

if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
  throw 'npx.cmd was not found. Reopen PowerShell after installing Node.js.'
}
if ($NotificationEmail) {
  $WixMailAddress = [System.Net.Mail.MailAddress]::new($NotificationEmail)
  if ($WixMailAddress.Address -ne $NotificationEmail -or $NotificationEmail -match '[\r\n]') {
    throw 'NotificationEmail must be one email address without a display name.'
  }
}
if ([string]::IsNullOrWhiteSpace($ProjectFolder)) { $ProjectFolder = Join-Path $PSScriptRoot 'google-project' }
$WixProjectPath = [System.IO.Path]::GetFullPath($ProjectFolder)
$WixSelectorPath = Join-Path $WixProjectPath '.clasp.json'
if (-not (Test-Path -LiteralPath $WixSelectorPath)) {
  throw 'The installed google-project folder was not found. Run this updater from the extracted Wix app folder; do not run the new-project installer again.'
}
$WixSelector = Get-Content -LiteralPath $WixSelectorPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($WixSelector.scriptId -notmatch '^[A-Za-z0-9_-]{20,200}$') { throw 'The installed project ID is invalid.' }

$WixStagePath = Join-Path $PSScriptRoot ('.wix-update-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $WixStagePath | Out-Null
$WixZipPath = Join-Path $WixStagePath 'release.zip'
$WixReleaseRoot = Join-Path $WixStagePath 'release'
$WixZipUrl = 'https://raw.githubusercontent.com/forestgym-tokyo/anauts-os-reserve/' + $ReleaseRef + '/downloads/wix-publish-scheduler/wix-publish-scheduler.zip'
Invoke-WebRequest -UseBasicParsing -Uri $WixZipUrl -OutFile $WixZipPath
if ((Get-FileHash -LiteralPath $WixZipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedZipSha256) {
  throw 'The downloaded ZIP failed integrity verification. No Google project was updated.'
}
Expand-Archive -LiteralPath $WixZipPath -DestinationPath $WixReleaseRoot
$WixPackagePath = Join-Path $WixReleaseRoot 'wix-publish-scheduler'
$WixAppPath = Join-Path $WixPackagePath 'app'
$WixBaselines = Get-Content -LiteralPath (Join-Path $WixPackagePath 'UPGRADE-BASELINES.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($WixFile in @('Code.gs', 'Notifications.gs', 'Index.html', 'appsscript.json')) {
  if (-not (Test-Path -LiteralPath (Join-Path $WixAppPath $WixFile))) { throw "Missing update file: $WixFile" }
}

$WixBackupPath = Join-Path $WixStagePath 'live-before'
$WixUploadPath = Join-Path $WixStagePath 'upload'
New-Item -ItemType Directory -Path $WixBackupPath | Out-Null
$WixClaspJson = @{ scriptId = $WixSelector.scriptId; rootDir = '.' } | ConvertTo-Json
Write-WixUtf8 (Join-Path $WixBackupPath '.clasp.json') $WixClaspJson

Push-Location -LiteralPath $WixBackupPath
try {
  Write-Host 'Backing up the existing Wix app source...'
  & npx.cmd --yes '@google/clasp@3.4.1' pull
  if ($LASTEXITCODE -ne 0) { throw 'The live source could not be backed up. No upload was attempted.' }
} finally { Pop-Location }

$WixRemoteCode = @(Get-ChildItem -LiteralPath $WixBackupPath -File | Where-Object { $_.Name -in @('Code.gs', 'Code.js') })
if ($WixRemoteCode.Count -ne 1) { throw 'Cannot identify the Wix app Code module. No upload was attempted.' }
$WixRemoteText = Get-Content -LiteralPath $WixRemoteCode[0].FullName -Raw -Encoding UTF8
if (-not $WixRemoteText.Contains('function initializeWixPublisher') -or -not $WixRemoteText.Contains('site-publisher/v1/site/publish')) {
  throw 'The selected Google project is not the Wix scheduler. No upload was attempted.'
}
foreach ($WixModule in @('Code', 'Index', 'Notifications')) {
  $WixMatches = @(Get-ChildItem -LiteralPath $WixBackupPath -File | Where-Object { $_.BaseName -eq $WixModule -and $_.Extension -in @('.gs', '.js', '.html') })
  if ($WixModule -eq 'Notifications' -and $WixMatches.Count -eq 0) { continue }
  if ($WixMatches.Count -ne 1) { throw "Cannot identify live module $WixModule. No upload was attempted." }
  $WixAllowed = @($WixBaselines.PSObject.Properties[$WixModule].Value)
  if ($WixAllowed -notcontains (Get-WixSourceHash $WixMatches[0].FullName)) {
    throw "Live module $WixModule has unreviewed changes. Source was backed up, but nothing was uploaded."
  }
}

New-Item -ItemType Directory -Path $WixUploadPath | Out-Null
Get-ChildItem -LiteralPath $WixBackupPath -Force | Copy-Item -Destination $WixUploadPath -Recurse -Force
foreach ($WixFile in @('Code.gs', 'Code.js', 'Notifications.gs', 'Notifications.js')) {
  $WixOldPath = Join-Path $WixUploadPath $WixFile
  if (Test-Path -LiteralPath $WixOldPath) { Remove-Item -LiteralPath $WixOldPath }
}
foreach ($WixFile in @('Code.gs', 'Notifications.gs', 'Index.html')) {
  Copy-Item -LiteralPath (Join-Path $WixAppPath $WixFile) -Destination (Join-Path $WixUploadPath $WixFile)
}
if ($NotificationEmail) {
  foreach ($WixOldFile in @('WixNotificationDestination.gs', 'WixNotificationDestination.js')) {
    $WixOldDestination = Join-Path $WixUploadPath $WixOldFile
    if (Test-Path -LiteralPath $WixOldDestination) {
      $WixOldText = Get-Content -LiteralPath $WixOldDestination -Raw -Encoding UTF8
      $WixOldText = $WixOldText.Trim()
      $WixPrefix = 'var WP_REQUESTED_NOTIFICATION_EMAIL = '
      if (-not $WixOldText.StartsWith($WixPrefix) -or -not $WixOldText.EndsWith(';')) {
        throw 'An unrecognized notification destination module exists. No upload was attempted.'
      }
      $WixOldLiteral = $WixOldText.Substring($WixPrefix.Length, $WixOldText.Length - $WixPrefix.Length - 1)
      $WixPreviousEmail = ConvertFrom-Json -InputObject $WixOldLiteral
      if ($WixPreviousEmail -isnot [string]) { throw 'Unrecognized notification configuration. No upload was attempted.' }
      Remove-Item -LiteralPath $WixOldDestination
    }
  }
  $WixEmailLiteral = ConvertTo-Json -InputObject $NotificationEmail -Compress
  Write-WixUtf8 (Join-Path $WixUploadPath 'WixNotificationDestination.gs') ('var WP_REQUESTED_NOTIFICATION_EMAIL = ' + $WixEmailLiteral + ';')
}
$WixManifestPath = Join-Path $WixUploadPath 'appsscript.json'
$WixManifest = Get-Content -LiteralPath $WixManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$WixNewManifest = Get-Content -LiteralPath (Join-Path $WixAppPath 'appsscript.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$WixScopes = @($WixNewManifest.oauthScopes)
if ($WixManifest.PSObject.Properties.Name -contains 'oauthScopes') { $WixScopes += @($WixManifest.oauthScopes) }
$WixManifest | Add-Member -MemberType NoteProperty -Name oauthScopes -Value @($WixScopes | Sort-Object -Unique) -Force
Write-WixUtf8 $WixManifestPath ($WixManifest | ConvertTo-Json -Depth 100)
Write-WixUtf8 (Join-Path $WixUploadPath '.clasp.json') $WixClaspJson
@('**', '!**/*.gs', '!**/*.js', '!**/*.html', '!appsscript.json') | Set-Content -LiteralPath (Join-Path $WixUploadPath '.claspignore') -Encoding Ascii

Push-Location -LiteralPath $WixBackupPath
try {
  & npx.cmd --yes '@google/clasp@3.4.1' create-version before-wix-notifications-v020
  if ($LASTEXITCODE -ne 0) { throw 'A native Google backup version could not be created. No upload was attempted.' }
} finally { Pop-Location }
Push-Location -LiteralPath $WixUploadPath
try {
  Write-Host 'Updating this EXISTING Wix app. Script properties and reservations are not reset.'
  & npx.cmd --yes '@google/clasp@3.4.1' push --force
  if ($LASTEXITCODE -ne 0) { throw "The update did not finish. Backup: $WixBackupPath" }
} finally { Pop-Location }

$WixEditorUrl = 'https://script.google.com/home/projects/' + $WixSelector.scriptId + '/edit'
Write-Host ''
Write-Host 'Source updated. Before the reserved time, run initializeWixPublisher and approve the mail permission.'
Write-Host 'Then use Manage deployments > Edit > New version to update the SAME web app URL.'
Write-Host 'Set the notification email in the web app and send a test email.'
Write-Host ('Backup: ' + $WixBackupPath)
Write-Host $WixEditorUrl
Start-Process $WixEditorUrl
