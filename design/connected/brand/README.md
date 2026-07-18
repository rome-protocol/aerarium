# Rome Logo Lockup — drop-in component

A reusable, pre-tuned logomark + ROME wordmark pair for any Rome surface.
Both files in this folder are cropped tightly to their ink bounds with
matched padding, so setting `height` on both equally produces visually
equal sizes — no per-side adjustment needed.

## Files

- `Lockup.jsx` — React component
- `logomark-tight.svg` — bowtie logomark, cropped to ink + 20u pad
- `wordmark-tight.svg` — ROME letters only, cropped to ink + 20u pad

## Why "tight" SVGs

The originals at `assets/logomark-purple.svg` and `assets/wordmark-purple.svg`
share a `4149×1461` viewBox with heavy padding around the actual artwork.
Setting equal CSS heights on the originals makes them *look* mismatched
because the bowtie ink is ~1.6× taller than the letter ink. The tight
crops fix this.

## Usage (Babel JSX project)

```html
<script type="text/babel" src="brand/Lockup.jsx"></script>
```

```jsx
<Lockup />                          // 38px default — works in app headers
<Lockup size={48} />                // taller variant
<Lockup size={64} basePath="brand"> // when assets live in /brand/ instead of /assets/
```

## Default proportions

| Prop      | Default      | Notes                                              |
|-----------|--------------|----------------------------------------------------|
| `size`    | `38`         | Pixel height of both marks                         |
| `gap`     | `~size*0.24` | Auto-scales with size; min 6px                     |
| `basePath`| `'assets'`   | Folder where the two .svg files live               |

## Promoting to the design system

When the design system gets write access, copy:
- `Lockup.jsx` → `ui_kits/marketing/Lockup.jsx` (or a new `brand/` folder)
- `logomark-tight.svg`, `wordmark-tight.svg` → `assets/`

…then add a preview card to `preview/brand-wordmark.html`.
