# Pexulon AI on Cloudflare Pages
1. Push this folder to GitHub (root of the repository).
2. Cloudflare → Workers & Pages → your project → Settings → Variables and Secrets: `GEMINI_API_KEY` = your key, type Secret. Redeploy.
3. After each deploy open the site once and hard-reload (the service worker updates itself).
