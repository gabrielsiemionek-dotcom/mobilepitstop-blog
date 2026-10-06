# MobilePitStop Blog

The blog at **blog.mobilepitstop.uk**. Claude writes a new post every Monday, Wednesday and Friday morning, and Gab approves each one before it goes live. The site is plain static pages hosted free on GitHub Pages, styled to match mobilepitstop.uk.

```
plan.json (topics) ──▶ Claude writes a draft ──▶ Gab gets a preview ──▶ "publish" ──▶ status: published ──▶ GitHub Pages
        ▲                    │ uses
        │                    ▼
mobilepitstop-blog-library (PRIVATE repo): job photos + photos.json + plan.json
```

## The two repos

| Repo | Visibility | What's in it |
|---|---|---|
| `mobilepitstop-blog` | Public, so GitHub Pages is free | The site code, the writing rules, business facts and published posts |
| `mobilepitstop-blog-library` | **Private** | Gab's job photos, the photo catalogue and the topic plan |

The photo library is private because some photos show customers' number plates or houses. A post only ever carries a checked copy of a photo, with plates blurred or cropped out.

## What's where

- `WRITING.md`: how posts are written (voice, facts, honesty rules, structure, images)
- `content/facts.json`: the only source of business facts. **Prices stay out of posts until confirmed prices are added here.**
- `content/posts/<slug>/`: one folder per post (`post.json`, `body.html`, images). `"status": "draft"` posts are never published.
- `site.config.mjs`: blog name, menu links, contact details, call-to-action box
- `assets/`: stylesheet and logo
- `scripts/`:
  - `build.mjs`: builds the site
  - `check-post.mjs`: checks a post against the rules
  - `preview.mjs`: makes a one-file preview to send Gab
  - `graphic.mjs`: branded graphics
  - `photo.mjs`: crops photos and blurs number plates

## Publishing

Every push to `main` runs **Publish blog** (`.github/workflows/publish.yml`), which:

1. checks every post
2. builds the site
3. publishes it to GitHub Pages

The same workflow also runs every morning, so a post given a future `publishedAt` goes live on its day.

## One-time setup

1. Create both repos on GitHub (`mobilepitstop-blog` public, `mobilepitstop-blog-library` private) and push these folders.
2. In `mobilepitstop-blog`, go to Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Pages → Custom domain: `blog.mobilepitstop.uk`. Then in Squarespace DNS add **CNAME** `blog` → `<github-username>.github.io`. Once the check passes, tick **Enforce HTTPS**.
4. Give Claude access to both repos, so the scheduled writing sessions can read the library and push posts.
5. Add a **Blog** link to the Squarespace menu, and submit `https://blog.mobilepitstop.uk/sitemap.xml` in Google Search Console.

## Running things by hand

```bash
npm run check -- content/posts/<slug>     # check a post
npm run build:drafts                       # build including drafts into dist/
node scripts/preview.mjs <slug> out.html   # one-file preview
npm run graphic -- spec.json               # branded graphics (needs Playwright + sharp)
npm run photo -- <photo> <out.webp> --aspect 16:9 --blur x,y,w,h
```
