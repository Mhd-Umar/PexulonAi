# ToolNest on Netlify

The AI features use the Netlify Functions in `netlify/functions/ai.js` and `netlify/functions/ai-stream.js`. The chat streaming endpoint requires a current Netlify Node.js runtime and Git/CLI deployment (static Drop uploads cannot run Functions).
Netlify's docs list two ways to deploy functions: Git, or the Netlify CLI/API. They do not list drag-and-drop (Drop), and a Netlify forum answer says functions don't run from Drop. So:

1. Recommended: put these files in a GitHub repo, then Netlify -> Add new project -> Import from Git. Build command: none. Publish directory: `.` (netlify.toml sets it).
2. Add the environment variable `GEMINI_API_KEY` (free key from aistudio.google.com) in Site configuration -> Environment variables, then redeploy.
3. Optional: `ALLOWED_ORIGINS`, `AI_MODEL`.
4. If you only use Drop: every non-AI tool and the PDF editor work. For AI, each visitor can paste a free key in Settings.

Test the standard endpoint: open `https://YOURSITE.netlify.app/.netlify/functions/ai` in a browser. Test the streaming endpoint with a POST request from the AI Chat UI. `{"error":"Use POST."}` means the function is live.
