param(
  [switch]$Preview
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

if ($Preview) {
  pnpm preview
  exit $LASTEXITCODE
}

pnpm dev
exit $LASTEXITCODE
