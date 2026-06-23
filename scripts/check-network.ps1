# check-network.ps1
# Run this script in a PowerShell window to verify local network settings and port reachability.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\check-network.ps1

Write-Host "=== Network Diagnostic Helper ===" -ForegroundColor Cyan

# Show active IPv4 addresses
Write-Host "\n[1] Local IPv4 Addresses:" -ForegroundColor Yellow
$interfaces = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' }
if ($interfaces) {
  $interfaces | Format-Table InterfaceAlias, IPAddress, PrefixLength, AddressState -AutoSize
} else {
  Write-Host "No active non-loopback IPv4 addresses found." -ForegroundColor Red
}

# Show default gateway
Write-Host "\n[2] Default Gateway:" -ForegroundColor Yellow
Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1 | Format-Table -AutoSize

# Show firewall rules for app ports
Write-Host "\n[3] Firewall Rules for Local Dev Ports:" -ForegroundColor Yellow
$ports = @(3000, 9099, 8080)
foreach ($p in $ports) {
  $rule = Get-NetFirewallRule -DisplayName "Allow Port ${p}" -ErrorAction SilentlyContinue
  if ($rule) {
    Write-Host "Port ${p}: rule exists" -ForegroundColor Green
  } else {
    Write-Host "Port ${p}: rule not found" -ForegroundColor Red
  }
}

# Show Chrome firewall rule presence if possible
Write-Host "\n[4] Chrome firewall check:" -ForegroundColor Yellow
$chromeRules = Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*chrome.exe' }
if ($chromeRules) {
  $chromeRules | Select-Object Program, Direction, Action | Format-Table -AutoSize
} else {
  Write-Host "No explicit Chrome firewall application filters found." -ForegroundColor Yellow
}

# Test local HTTP binding on localhost and local IP addresses
Write-Host "\n[5] Local HTTP reachability tests:" -ForegroundColor Yellow
$tests = @('http://localhost:3000')
$interfaces | ForEach-Object {
  $tests += "http://$($_.IPAddress):3000"
}
foreach ($url in $tests | Select-Object -Unique) {
  Write-Host "Testing $url..." -NoNewline
  try {
    $response = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 5
    Write-Host " OK (status $($response.StatusCode))" -ForegroundColor Green
  } catch {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
  }
}

Write-Host "\nDiagnostic complete. If you see failures for the local IP, the issue is network/firewall-related." -ForegroundColor Cyan
Write-Host "If the app is not reachable by IP, ensure the dev server is running and Windows firewall allows inbound TCP 3000." -ForegroundColor Cyan
