# logseq-d2

A [Logseq](https://logseq.com) plugin that renders [D2](https://d2lang.com) diagrams fully client-side using the official WebAssembly engine.

![demo](demo.gif)

## Features

- **Fully offline** — the D2 WASM engine is bundled. No server, no token.
- **Native block rendering** — classic builds use Logseq's official fenced-code renderer, so the diagram becomes the block content. The source editor is hidden in preview mode and the virtual list measures the diagram itself.
- **Live previews** — edits re-render after a short debounce.
- **Smooth scrolling** — zero layout shifts and instant diagram recovery. Known diagram dimensions are pre-reserved on remount, eliminating scroll jumps and flickers.
- **Themes and sketch mode** — 20 built-in D2 themes, sketch style, transparent background, and intelligent Auto themes that match Logseq light/dark mode seamlessly.
- **Logseq DB and classic** — official renderer on classic builds, an image-based DOM fallback on DB.
- **Inline errors** — invalid D2 shows a readable message instead of breaking the block.

## Usage

Write a fenced code block with the `d2` language:

````markdown
```d2
direction: right
server -> database: queries
database -> cache: invalidates
```
````

Run `/d2` to insert a starter block.

## Settings

Open **Settings** → **Plugin Settings** → **D2 Diagram Renderer**:

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Theme** | Color theme for rendered diagrams. Auto follows Logseq light/dark mode. | `Auto (match Logseq)` |
| **Sketch mode** | Render diagrams in hand-drawn sketch style | `false` |
| **Diagram size** | Scale the rendered diagram (`0.75`–`1.5`) | `1` |

Changing any setting re-renders every diagram on the page. With `Auto`, switching Logseq between light and dark also re-renders diagrams. The D2 canvas background is transparent, so the Logseq card provides the surface.

## How it works

| Module | Responsibility |
| :--- | :--- |
| `src/main.ts` | Registers settings, the `/d2` command, the fenced-code renderer, and lifecycle hooks. |
| `src/fenced.ts` | Registers a D2 component with Logseq's official fenced-code renderer (classic builds). Renders cached SVGs during the first React render so remounted blocks keep their height. |
| `src/renderer.ts` | DOM fallback for Logseq DB and builds where the official renderer does not fire. Observes `d2` blocks and injects rendered SVGs into preview containers with pre-reserved heights. |
| `src/engine.ts` | Serializes D2 compiles through one WASM worker and caches both SVG and a data-URL image with intrinsic dimensions. |
| `src/errors.ts` | Formats D2 syntax errors for inline display. |
| `src/settings.ts` | Maps plugin settings to D2 render options. |
| `src/styles.ts` | Styles the preview, loading, error states, and the fade-in animation. |

## Development

```sh
pnpm install
pnpm dev       # rebuild on change
pnpm build     # production bundle in dist/
pnpm typecheck
```

In Logseq: **Plugins** → **Load unpacked plugin** → select this repository directory.

## License

[MIT](./LICENSE)
