# AI City Tours — The SetUp Crew

Static site that hosts AI-guided walking tours of British cities. Each city is a self-contained single-page app served from its own folder.

## Live URLs

- Landing: `/` — city picker
- Hereford: `/hereford/` — guided walk with Harriet, 10 stops

## Repository structure

```
site/
├── index.html              # Landing page (city picker)
├── hereford/
│   └── index.html          # Hereford tour app
├── vercel.json             # Routing & headers
├── .gitignore
└── README.md
```

## Adding a new city

1. Copy `hereford/index.html` to `<city>/index.html`.
2. In the new file, update the `CONFIG` object near the top of the `<script>` block: `city`, `postcodeArea`, `guideName`, `guideVoiceId`, `colorPrimary` etc., and the `stops`, `locationFacts`, `sponsors`, `events` arrays.
3. Add the city to the picker in `index.html`.
4. Commit and push — Vercel auto-deploys.

## Deployment

Hosted on Vercel via GitHub integration. Pushing to `main` triggers a production deploy.

## Status

Beta — Hereford only. Sales target: heritage BIDs, tourist info centres, DMOs at £500/month per city.
