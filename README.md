# ToolNest — 90+ free tools in one website

A static website (no build step). Everything runs in the visitor's browser except the optional ✨ AI tools.

## Deploy from your phone (Netlify)
**Easiest (no AI proxy):** unzip → in Netlify choose *Add new site → Deploy manually* and drop the folder. All tools work. For AI, each visitor can paste their own free key in ⚙ Settings.
**With the built-in AI proxy (recommended):** put the folder in a GitHub repository, then in Netlify choose *Import from Git*. Netlify reads `netlify.toml` and deploys `netlify/functions/ai.js` automatically. Then in *Site settings → Environment variables* add ONE of:
- `GEMINI_API_KEY` — free key from Google AI Studio
- `GROQ_API_KEY` — free key from console.groq.com

Optional: `AI_MODEL` (change the model), `ALLOWED_ORIGINS` (extra allowed sites). Free-tier limits and model names change over time — check the provider's page. Keep your key secret: only put it in Netlify, never in the code.

## PDF Editor (the headline tool)
- Export prepares every page with text edits before saving, including off-screen pages, so background patches are not skipped. Text replacement samples the rendered page edges and blends the cover colour across the line to better preserve tinted and coloured page backgrounds. Always inspect the saved PDF, especially on patterned or photographic backgrounds.
- Tap text → rewrite it (paragraph or single line). Original text is **removed from the PDF content stream**, not just covered, when the font is a standard simple font. The status line tells you how many edits were removed vs. covered.
- Add text, images, signature, links; whiteout, redact (really removes text under the box), highlight, underline, strike, draw, shapes; find & replace; reorder/rotate/delete/add pages; undo/redo; zoom.
- Honest limits: new text uses the 3 standard PDF font families (Helvetica/Times/Courier), not the document's original embedded font; text with other scripts (e.g. Malayalam) is saved as a picture (looks right, not selectable); no OCR for scanned PDFs; no password-protected PDFs; vertical text is not editable; complex layouts (tables, columns) are edited line by line. Always check the result before sending it.

## Files
`index.html`, `css/`, `js/` (app, tools, libraries), `sw.js` + `manifest.webmanifest` (works offline, installable), `netlify/functions/ai.js` (AI proxy), `netlify.toml`.

## Licences of bundled libraries
pdf.js (Apache-2.0), pdf-lib (MIT), JSZip (MIT), marked (MIT). Their licence texts apply to the files in `js/lib/`.

## Privacy
Non-AI tools never upload files. ✨ AI tools send the text you submit to the AI provider. The optional password breach check sends only the first 5 characters of a SHA-1 hash.


## Netlify
See NETLIFY-GUIDE.md. `js/config.js` must keep `TN_AI_URL = ''` on Netlify.
