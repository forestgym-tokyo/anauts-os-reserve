[CmdletBinding()]
param([string]$ProjectFolder = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw 'Node.js 22 or newer is required.'
}
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
  throw 'npx.cmd was not found. Install Node.js, then reopen PowerShell.'
}
$WixAppNodeVersion = & node.exe --version
if ($LASTEXITCODE -ne 0) {
  throw 'Could not read the Node.js version.'
}
$WixAppNodeMajor = ([version]($WixAppNodeVersion.TrimStart('v'))).Major
if ($WixAppNodeMajor -lt 22) {
  throw 'Node.js 22 or newer is required.'
}
if ([string]::IsNullOrWhiteSpace($ProjectFolder)) {
  $ProjectFolder = Join-Path $PSScriptRoot 'google-project'
}
$WixAppProjectPath = [System.IO.Path]::GetFullPath($ProjectFolder)
if (Test-Path -LiteralPath $WixAppProjectPath) {
  throw 'The destination already exists. No existing Apps Script project will be overwritten. Choose a new ProjectFolder or inspect the previous installation.'
}
$WixAppSourcePath = Join-Path $PSScriptRoot 'app'
foreach ($WixAppFile in @('Code.gs', 'Notifications.gs', 'Index.html', 'appsscript.json')) {
  if (-not (Test-Path -LiteralPath (Join-Path $WixAppSourcePath $WixAppFile))) {
    throw "Missing app file: $WixAppFile. Extract the entire ZIP first."
  }
}

New-Item -ItemType Directory -Path $WixAppProjectPath | Out-Null
Push-Location -LiteralPath $WixAppProjectPath
try {
  Write-Host 'Creating a NEW standalone Apps Script project...'
  & npx.cmd --yes '@google/clasp@3.4.1' create-script --type standalone --title 'The Forest Gym - Wix publish scheduler'
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not create the project. Check clasp login and Apps Script API access. The existing reservation project was not changed.'
  }
  $WixAppNewConfig = Get-Content -LiteralPath '.clasp.json' -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($WixAppNewConfig.scriptId)) {
    throw 'The NEW project ID could not be read. No upload was attempted.'
  }
  foreach ($WixAppFile in @('Code.gs', 'Notifications.gs', 'Index.html', 'appsscript.json')) {
    Copy-Item -LiteralPath (Join-Path $WixAppSourcePath $WixAppFile) -Destination (Join-Path $WixAppProjectPath $WixAppFile) -Force
  }
  @('**', '!Code.gs', '!Notifications.gs', '!Index.html', '!appsscript.json') | Set-Content -LiteralPath '.claspignore' -Encoding Ascii
  & npx.cmd --yes '@google/clasp@3.4.1' push --force
  if ($LASTEXITCODE -ne 0) {
    throw 'The upload did not finish. Inspect the new project before retrying. No Wix publication was attempted.'
  }
  $WixAppEditorUrl = 'https://script.google.com/home/projects/' + $WixAppNewConfig.scriptId + '/edit'
  Write-Host ''
  Write-Host 'Source uploaded to the NEW project. Nothing has been published to Wix.'
  Write-Host 'Next: run initializeWixPublisher in the editor, then deploy the web app for yourself only.'
  Write-Host $WixAppEditorUrl
  Start-Process $WixAppEditorUrl
} finally {
  Pop-Location
}
