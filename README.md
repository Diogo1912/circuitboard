# Circuitboard

**A powerful visual system design tool for creating interactive diagrams, flowcharts, and system architectures.**

Circuitboard is a web-based diagramming tool that lets you create beautiful, interactive visualizations of complex systems. Whether you're designing software architectures, mapping business processes, or creating educational diagrams, Circuitboard provides an intuitive interface with powerful features.

🌐 **[Try it now - No installation required!](https://diogo1912.github.io/circuitboard)**

## What is Circuitboard?

Circuitboard transforms complex ideas into clear visual representations using:
- **Nodes (circles)** - Represent components, entities, or concepts
- **Links (arrows)** - Show relationships, data flow, or dependencies  
- **Sticky notes** - Add context, documentation, or annotations
- **Interactive canvas** - Pan, zoom, and explore your diagrams seamlessly

Perfect for software architects, system designers, educators, product managers, and anyone who needs to communicate complex ideas visually.

## ✨ Key Features

### 🔵 Smart Nodes
- **Easy creation** - Click the + button to add nodes instantly
- **Flexible editing** - Customize name, color, size, description, and tags
- **Visual consistency** - Automatic light/dark text color or manual override
- **Intuitive manipulation** - Drag to move, resize with corner handles

### ↗️ Dynamic Links  
- **Simple connection** - Drag from node handles to create relationships
- **Directional flow** - Choose between bidirectional (↔), unidirectional (→), or neutral connections
- **Curved paths** - Click and drag edges to create elegant curves
- **Rich annotations** - Add keywords and labels to describe relationships

### 📝 Markdown Sticky Notes
- **Quick documentation** - Click anywhere to add contextual notes
- **Live preview** - Real-time markdown rendering while editing
- **Flexible sizing** - Drag to resize, delete via trash when not needed

### 🗺️ Interactive Canvas
- **Smooth navigation** - Pan by dragging, zoom with intuitive controls
- **Smart interactions** - Hover highlighting and safe click detection
- **Edge management** - Click any connection to modify its properties

### 💾 Save & Share
- **Portable format** - Generate compact shareable codes for your diagrams
- **Version control** - Save multiple versions and restore any previous state
- **No account required** - Everything works locally in your browser

### 📸 Professional Export
- **High-quality PNG** - Export crisp, high-DPI images for presentations
- **What you see is what you get** - Perfect reproduction of your canvas

### 🎨 User Experience
- **Built-in guide** - Interactive tutorial to get you started quickly  
- **Update notifications** - Stay informed about new features
- **Clean interface** - Distraction-free design focused on your content

## 🚀 Get Started

The easiest way to use Circuitboard is through the **[live web app](https://diogo1912.github.io/circuitboard)** - no installation required!

## 🛠️ Local Development

Want to contribute or run locally? 

```bash
cd web
npm install
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```

<details>
<summary>📋 Deploy to GitHub Pages (Click to expand)</summary>

### Repository Setup
- Ensure your repo has the `web/` folder at the root
- In GitHub → Settings → Pages: set Source to "Deploy from a branch" and select `gh-pages`

### Vite Configuration  
For `https://<user>.github.io/<repo>/` deployment, edit `web/vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react()],
  base: '/<repo>/', // replace with your repository name
})
```

### GitHub Actions Workflow
Create `.github/workflows/deploy.yml`:
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

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - working-directory: web
        run: npm ci --no-audit --no-fund
      - working-directory: web  
        run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

</details>

## 🏗️ Technical Details

- **100% Frontend** - No server required, runs entirely in your browser
- **Privacy First** - All data stays local, nothing is sent to external servers  
- **Modern Stack** - Built with React, TypeScript, and Vite for optimal performance
- **Cross-Platform** - Works on desktop, tablet, and mobile devices

## 📄 License

This project is open source. Feel free to contribute, report issues, or suggest new features!

---

**Made with ❤️ for the system design community**
