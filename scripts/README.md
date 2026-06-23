Start-dev-windows script

This helper script opens the necessary firewall ports and launches the Firebase emulator and the dev server in separate PowerShell windows.

Steps:
1. Open an elevated PowerShell (Run as Administrator).
2. From the project root run:

   powershell -ExecutionPolicy Bypass -File .\scripts\start-dev-windows.ps1

3. Two windows will open: one running `npm run emulator`, the other `npm run dev`.
4. Once both are running, open the app from another device on your LAN at:

   http://<dev-machine-ip>:3000

Optional network check:

   powershell -ExecutionPolicy Bypass -File .\scripts\check-network.ps1

This helper reports local IPs, firewall rules, and whether `http://<dev-ip>:3000` is reachable.

Notes:
- Make sure Node.js and npm are installed and available in PATH.
- If your company Wi-Fi or router has client isolation, LAN access may be blocked.
- The script adds firewall rules named "Allow Port <port>"; you can remove them later via Windows Defender Firewall UI or `Remove-NetFirewallRule`.
