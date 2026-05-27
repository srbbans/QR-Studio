# QR Studio

A clean, production-ready QR code generator that runs entirely in the browser. Drop a link or any text, customize colors / size / error-correction level, and download as PNG or SVG. 

## Run locally

Open `index.html` in a browser — that's it. No build step, no dependencies to install. The QR library loads from a CDN.

Or serve it with any static server:

```powershell
# Python (if installed)
python -m http.server 8080

# Node (if installed)
npx serve .
```

## Deploy on GitHub Pages

1. Create a new repo on GitHub (e.g. `qr-studio`) and push these files to the `main` branch.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main` / `(root)`
4. Save. After ~1 minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

No build configuration, no GitHub Actions required — it's a pure static site.

## Files

- `index.html` — markup
- `styles.css` — styling (light + dark theme)
- `app.js` — generation, download, clipboard logic
- `vendor/qrcode.min.js` — bundled [`qrcode-generator`](https://www.npmjs.com/package/qrcode-generator) library (MIT, Kazuhiko Arase). Works fully offline. A jsDelivr CDN fallback kicks in only if the local file is missing.

## Privacy

Everything runs client-side. Your input never leaves the browser.
