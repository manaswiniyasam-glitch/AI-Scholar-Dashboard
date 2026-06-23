# start-dev-windows.ps1
# Run this script as Administrator to open firewall ports and start the emulator + dev server.
# Usage: Right-click -> Run with PowerShell (or run in an elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-dev-windows.ps1

# Relaunch as admin if needed
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
  Write-Host "Requesting elevation..."
  Start-Process pwsh -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File \"$PSCommandPath\"" -Verb RunAs
  exit
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Write-Host "Workspace root:" $root

# Firewall ports to allow
$ports = @(3000, 9099, 8080)
foreach ($p in $ports) {
  $ruleName = "Allow Port $p"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    try {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $p | Out-Null
      Write-Host "Added firewall rule for port $p"
    } catch {
      Write-Warning "Failed to add firewall rule for port $p: $_"
    }
  } else {
    Write-Host "Firewall rule already exists for port $p"
  }
}

Start-Sleep -Milliseconds 400

# Start emulator in new PowerShell window
Start-Process pwsh -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Set-Location -LiteralPath '$root'; npm run emulator" -WindowStyle Normal
Write-Host "Started Firebase emulator in a new window."

Start-Sleep -Milliseconds 500

# Start dev server in new PowerShell window
Start-Process pwsh -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Set-Location -LiteralPath '$root'; npm run dev" -WindowStyle Normal
Write-Host "Started dev server in a new window."

Write-Host "All processes started. Check the emulator and dev server windows for logs."
Read-Host -Prompt "Press Enter to finish"
