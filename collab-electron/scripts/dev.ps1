$ErrorActionPreference = "Stop"

function Normalize-WindowsPath {
  param([string]$Path)

  if ($null -eq $Path) { return $null }
  if ($Path.StartsWith("\\?\UNC\")) {
    return "\\" + $Path.Substring("\\?\UNC\".Length)
  }
  if ($Path.StartsWith("\\?\")) {
    return $Path.Substring("\\?\".Length)
  }
  return $Path
}

$scriptRoot = Normalize-WindowsPath $PSScriptRoot
$repoDir = [System.IO.Path]::GetFullPath(
  [System.IO.Path]::Combine($scriptRoot, "..")
)
$electronPath = [System.IO.Path]::Combine(
  $repoDir,
  "node_modules",
  "electron",
  "dist",
  "electron.exe"
)
$electronVitePath = [System.IO.Path]::Combine(
  $repoDir,
  "node_modules",
  ".bin",
  "electron-vite.exe"
)

Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ExecutablePath -eq $electronPath -and
      $_.CommandLine -notlike "*pty-sidecar.js*"
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Get-Process -Name electron-vite -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$repoDir*" } |
  ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }

$env:COLLAB_DEV_WORKTREE_ROOT = $repoDir

Start-Sleep -Milliseconds 500

& $electronVitePath dev
exit $LASTEXITCODE
