<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6458b3e2-840d-4197-8592-87aabea2a1a3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

Access from other devices on your LAN

- Ensure the dev server is running (it binds to `0.0.0.0` and listens on port `3000`).
- On Windows: run `start-dev.bat` (or `scripts/start-dev-windows.ps1`) to automatically add firewall rules for port `3000` and start the emulator + dev server.
- After the server starts it will print LAN addresses, e.g. `Accessible on LAN: http://192.168.1.42:3000` — open that URL from another device on the same network.
- If you prefer manual steps: run `npm run dev`, then find your machine's IPv4 address (`ipconfig` on Windows, `ifconfig` or `ip addr` on macOS/Linux) and open `http://<YOUR_IP>:3000` from other devices.

Notes
- If you have a strict OS firewall or corporate network policies, ensure port `3000` is allowed and devices are on the same subnet.
- HMR and live-reload are enabled for development; if you experience HMR issues across devices, disable `DISABLE_HMR` in your environment.
