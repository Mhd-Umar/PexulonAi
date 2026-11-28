# Pexulon AI — PDF editor, AI assistant and 90+ free tools

A static website (no build step) deployed on **Cloudflare Pages**. Everything runs in the visitor's browser except the ✨ AI tools, which call the Pages Functions in `functions/api/`.

## Deploy (Cloudflare Pages + GitHub)
1. Pages project → connect the GitHub repo. Build command: *(empty)*. Output directory: `/`.
2. Settings → Variables and Secrets → add `GEMINI_API_KEY` (type **Secret**), then redeploy.
3. Optional variables: `AI_MODEL` (preferred Gemini model), `ALLOWED_ORIGINS` (extra allowed origins, comma separated).
`js/config.js` must keep `TN_AI_URL = ''` so the site uses its own `/api/ai` and `/api/ai-stream`.

## AI
- Streaming answers, Markdown structure (headings, bold, lists, tables), Copy / Continue / Save.
- Long PDFs of any length: the text of every page is read in the browser. Summaries and notes process the document in parts and merge them into one ordered result. "Ask a PDF" finds the most relevant pages for each question and cites page numbers.
- Quiz generator: any number of questions from 1 to 100, difficulty, options or True/False, score and download.
- The free Gemini key is shared by all visitors, so very long documents can hit rate limits; the app retries automatically.

## PDF Editor
- Tap text → edit. The original glyphs are removed from the PDF content stream (also inside form XObjects, and glyph by glyph when only part of a text run is edited), then the new text is written as real text with a matching font, bold/italic, colour and alignment (left / centre / right is detected and kept).
- If the original cannot be removed (scans, flattened pages) it is covered with the sampled background colour.
- Characters missing from the chosen font switch to a bundled DejaVu font. Malayalam, Hindi, Arabic and other complex scripts are drawn exactly as typed (as a picture) with an invisible text layer on top, so they can be selected, searched and copied as correct Unicode text.
- Not supported: password-protected PDFs, vertical text, OCR of scans.

## Files
`index.html`, `CSS/app.css`, `js/` (app, tools, libraries, fonts), `sw.js` + `manifest.webmanifest` (offline, installable), `functions/` (Cloudflare Pages Functions), `icons/`.

## Licences
pdf.js (Apache-2.0), pdf-lib (MIT), JSZip (MIT), marked (MIT).

## Privacy
Non-AI tools never upload files. ✨ AI tools send the text you submit to the AI provider.
