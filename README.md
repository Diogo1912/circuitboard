# Circuitboard

Visualize systems using nodes (circles) and links (arrows), with sticky notes, zoom/pan, save/open via a shareable code, and PNG export. Frontend-only.

## Features

- Nodes
  - Add with the + button; drag to move; resize via 4 corner handles
  - Edit name, color, size, description, and tags (comma-separated)
  - Optional text color override (light/dark)
  - Delete from editor or drag the node into the trash circle
- Links (arrows)
  - Create by dragging from a node handle (left/right/top/bottom) onto another node
  - Direction: none, → (source→target), or ← (target→source)
  - Curving: click-and-drag the edge to adjust curvature; arrowheads follow the curve
  - One edge max between two nodes (duplicates are ignored)
  - Keywords (e.g., increases/decreases) and short label note
- Sticky notes
  - Click background to create; double-click to edit
  - Markdown editing with live preview; drag to resize; delete via trash
- Canvas & navigation
  - Pan by dragging background; zoom with on-screen −/+
  - Hover edges to highlight; click edges to open settings
  - Safe interactions prevent accidental clicks after drags/pans
- Save/Open
  - Save: generates a compact code; Open: paste code to restore full scene
- Export
  - Export PNG of the current canvas (high-DPI)
- UI
  - Guide modal with topics; Updates modal with version/features
  - Footer credit
  - Optional Buy Me a Coffee button

## Local development

```bash
cd web
npm install
npm run dev
```

Build a production bundle:

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

The site is a static Vite build in `web/dist`. Use GitHub Pages to serve it.

### 1) Repository settings

- Ensure your repo has the `web/` folder at the root (this one).
- In GitHub → Settings → Pages: set Source to “Deploy from a branch”, and later select the `gh-pages` branch (the workflow below will produce it).

### 2) Vite base (if deploying to user/organization site, skip)

If deploying to `https://<user>.github.io/<repo>/`, set Vite base path so assets resolve correctly. Edit `web/vite.config.ts`:

```ts
export default defineConfig({
  plugins: [react()],
  base: '/<repo>/', // replace with your repository name
})
```

For user/organization sites at the root (e.g., `diogo1912.github.io`), leave `base` as default.

### 3) GitHub Actions workflow

Create `.github/workflows/deploy.yml` at the repo root:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install deps
        working-directory: web
        run: npm ci --no-audit --no-fund

      - name: Build
        working-directory: web
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 4) Enable Pages

- After the first successful run, go to Settings → Pages and ensure the site is set to the newly created deployment. The workflow publishes to the `github-pages` environment automatically.

### 5) Verify

- Push to `main` and wait for the workflow. Your site should be live at the URL indicated in the workflow output.

## Notes

- This project is frontend-only; there is no backend requirement.
- Assets like `circuit.png` and `book.svg` should live under `web/public/`.
