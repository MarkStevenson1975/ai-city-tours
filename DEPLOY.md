# Deploying AI City Tours to Vercel

One-time setup. After this, every push to `main` deploys automatically.

---

## Path A — Easiest (browser only, no command line)

### 1. Create the GitHub repository

1. Go to <https://github.com/new>
2. Repository name: `ai-city-tours` (or whatever you prefer)
3. Owner: your personal account (or a SetUp Crew org if you have one)
4. Visibility: **Private** is fine for beta
5. Don't tick "Initialize with README"
6. Click **Create repository**
7. Leave that page open — you'll need the URL in step 2

### 2. Upload the files

1. On the new repo's empty page, click **uploading an existing file**
2. Drag the **entire contents** of the `site/` folder into the page (the files inside `site/`, not the `site` folder itself)
   - You should see: `index.html`, `vercel.json`, `.gitignore`, `README.md`, `hereford/index.html`
3. Commit message: `Initial commit — Hereford beta`
4. Click **Commit changes**

### 3. Connect Vercel

1. Go to <https://vercel.com/new>
2. Click **Import Git Repository** → select GitHub → authorize if prompted → pick your `ai-city-tours` repo
3. Project name: `setupcrew-tours` (becomes part of the URL)
4. Framework preset: **Other**
5. Root directory: leave as `.`
6. Build & Output settings: leave defaults (no build command)
7. Click **Deploy**

Wait ~30 seconds. Vercel gives you a URL like `https://setupcrew-tours.vercel.app`. Test:

- `https://setupcrew-tours.vercel.app/` → city picker
- `https://setupcrew-tours.vercel.app/hereford/` → tour

That's it. Future updates: edit files on GitHub (or commit from your machine), Vercel re-deploys on every push.

---

## Path B — Command line (if you have git installed)

```bash
cd "/Users/markstevenson/Documents/Claude/Projects/AI City Tours/site"

# Initialise repo
git init
git add .
git commit -m "Initial commit — Hereford beta"
git branch -M main

# Create remote on GitHub (option B1: using gh CLI if installed)
gh repo create ai-city-tours --private --source=. --remote=origin --push

# OR (option B2: manual) create the repo at https://github.com/new first, then:
# git remote add origin https://github.com/YOUR_USERNAME/ai-city-tours.git
# git push -u origin main
```

Then go to <https://vercel.com/new> and follow steps 2–7 of Path A's "Connect Vercel" section.

---

## After the first deploy

### Updating the Hereford app

Edit `site/hereford/index.html`, then:

```bash
cd "/Users/markstevenson/Documents/Claude/Projects/AI City Tours/site"
git add hereford/index.html
git commit -m "Update Hereford narration"
git push
```

Vercel auto-deploys in ~20 seconds.

### Adding API keys (ElevenLabs, Claude)

The app currently prompts the user for an ElevenLabs key on first load (stored locally in their browser). For a real beta, you probably want the key baked in:

1. In Vercel: Project Settings → Environment Variables → add `ELEVENLABS_API_KEY`
2. We'll wire that into the `CONFIG` object via a build step in a future commit (this needs a small build script — flag it for next session)

For the absolute beta, the in-browser key prompt is fine — testers paste their own key once and it persists.

### Custom domain

When ready (e.g. `tours.thesetupcrew.co.uk`):

1. Vercel → Project → Settings → Domains → Add
2. Vercel shows DNS records to add at your domain registrar
3. Once DNS propagates, the custom URL is live alongside the `.vercel.app` one
