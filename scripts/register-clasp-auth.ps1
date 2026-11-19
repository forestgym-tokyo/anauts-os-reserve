#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$CredentialPath = (Join-Path $env:USERPROFILE '.clasprc.json')
)

$ErrorActionPreference = 'Stop'
$repository = 'forestgym-tokyo/anauts-os-reserve'
$temporaryDirectory = $null

try {
    try {
        $credentialJson = [System.IO.File]::ReadAllText($CredentialPath)
        $credentialConfig = ConvertFrom-Json -InputObject $credentialJson
        if (-not $credentialConfig.tokens.default.refresh_token) { throw 'Missing refresh token' }
    } catch {
        throw 'Google認証ファイルを確認できません。先に npx.cmd --yes @google/clasp@3.4.1 login でログインしてください。'
    }

    $ghCommand = Get-Command gh.exe -CommandType Application -ErrorAction SilentlyContinue
    if (-not $ghCommand) { $ghCommand = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue }
    if ($ghCommand) {
        $githubCli = $ghCommand.Source
    } else {
        Write-Host '登録に必要な公式ツールを一時フォルダに準備しています。'
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('forestgym-auth-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
        $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'amd64' }
        $expectedHash = if ($architecture -eq 'arm64') { '5282a09c7757210c6e2dfb11a56b11e14e646df9b3b6a49f155465f5f881c3b7' } else { '8813a72c899900afaa10e3fec8fbc64b908c89dbfe837e95ed2fa500fc140627' }
        $archive = Join-Path $temporaryDirectory 'github-cli.zip'
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v2.105.0/gh_2.105.0_windows_$architecture.zip" -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
            throw '公式ツールのダウンロードを確認できませんでした。もう一度実行してください。'
        }
        Expand-Archive -LiteralPath $archive -DestinationPath $temporaryDirectory
        $githubCli = (Get-ChildItem -LiteralPath $temporaryDirectory -Filter gh.exe -Recurse -File | Select-Object -First 1).FullName
        if (-not $githubCli) { throw '登録用ツールを準備できませんでした。' }
    }

    # A signed-out CLI is expected; suppress its error stream in Windows PowerShell too.
    $ErrorActionPreference = 'Continue'
    & $githubCli auth status --hostname github.com *> $null
    $authStatus = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($authStatus -ne 0) {
        Write-Host 'GitHubのログイン画面が開きます。対象のサイトを管理するGitHubアカウントでログインしてください。'
        $loginArguments = @('auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web')
        $loginHelp = & $githubCli auth login --help
        if (($loginHelp -join "`n") -match '--clipboard') {
            $loginArguments += '--clipboard'
            Write-Host 'コードの入力画面が出たら、Ctrl+Vで貼り付けて進んでください。'
        }
        & $githubCli @loginArguments
        if ($LASTEXITCODE -ne 0) { throw 'GitHubへのログインが完了しませんでした。' }
    }

    Write-Host 'Googleの認証情報を登録しています。認証情報は画面に表示しません。'
    $credentialJson | & $githubCli secret set CLASPRC_JSON --repo $repository
    if ($LASTEXITCODE -ne 0) {
        throw '登録できませんでした。forestgym-tokyo/anauts-os-reserve を管理できるGitHubアカウントか確認してください。'
    }
    $credentialJson = $null
    $credentialConfig = $null

    Write-Host '認証情報の登録が完了しました。接続確認を開始します。'
    & $githubCli workflow run tfg-settlement-policy-release.yml --repo $repository --ref fix/settlement-three-full-months -f phase=preflight
    if ($LASTEXITCODE -ne 0) { Write-Host '登録は完了しています。接続確認はこちらで続けます。' }
    Write-Host 'このチャットに「完了」と返信してください。'
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($temporaryDirectory) { Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}
