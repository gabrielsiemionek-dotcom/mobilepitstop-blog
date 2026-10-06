# How MobilePitStop blog posts are written

This guide is for whoever writes the posts, which is normally Claude on a schedule. Gab approves every post before it goes live. Read this file, `content/facts.json` and the plan in the library repo before writing.

## Who we're writing for

The readers are car owners in Cheshire, Merseyside and Flintshire with a real problem:

- a smell that won't go
- dog hair everywhere
- swirly paint
- a car to sell
- a lease to hand back

They want a straight answer and to know whether they can fix it themselves. Each post should leave them better informed. Some will also decide it's worth having it done properly. That decision is the business goal, but the post earns it by being useful first.

MobilePitStop is a **detailer, not a car wash**. Explain the method and why each step matters: why the pre-wash comes before the mitt, and why air fresheners don't fix smoke smell. That is what separates us from a forecourt wash.

## Voice

Write like Gab explaining it to a customer on their driveway:

- **Plain and direct.** Answer the question in the first two or three sentences, then explain.
- **Honest.** Say when a DIY fix is good enough, and when a cheaper service will do. Say what a service can't do: machine polishing removes *most* light swirls, not all; deep scratches through the clear coat need a body shop.
- **Specific.** Name the step, the tool and the reason. "Compressed air through the seat rails before the vacuum, because that's where grit hides" beats "a thorough clean".
- **First person plural** for the business ("we", "on our jobs") and second person for the reader ("your car").
- **UK English:** colour, tyre, valeting, bonnet, boot, number plate, car park.

**Never use:** delve, elevate, unleash, game-changer, look no further, in today's fast-paced world, whether you're X or Y, it's important to note, ever-evolving, testament to, seamless, nestled, embark, journey (about cleaning a car), showroom-ready, transform your ride. Don't open with a question or a dictionary definition. Keep exclamation marks to one per post at most.

## Facts and honesty (hard rules)

1. **Business facts come only from `content/facts.json`.** That covers services, what they include, areas, contact details and booking. If a fact isn't there, leave it out.
2. **No prices** unless they're listed in `facts.json → prices`. Link to the service page instead ("see prices and book"). `npm run check` fails on any £ amount that isn't listed.
3. **No made-up stories.** Don't invent customers, quotes, reviews, testimonials, job numbers or "last week a customer in Chester…". You may describe a real job shown in the photo library in general terms ("a Mercedes G-Class we detailed on a gravel drive"), using only what the photo shows.
4. **No guarantees or absolutes:** "100%", "guaranteed", "permanent", "removes all scratches", "never needs washing". No health claims about killing viruses or curing allergies. You can say steam sanitises contact surfaces.
5. **General car-care knowledge has to be mainstream and safe.** For example: why two buckets, what iron fallout is, why ozone needs an empty car. If you're not sure it's right, leave it out. No dangerous DIY advice: no mixing chemicals, no pressure-washing interiors, no ozone in an occupied car.
6. **Don't name or criticise competitors.** Comparing methods ("automatic brushes", "a sponge and one bucket") is fine.
7. **Only state the law as `facts.json` states it** (window tint). No other legal claims.

## Shape of a post

- **Title:** up to about 60 characters, with the main keyword near the start. Make it useful, not clickbait. Example: *How to Get Dog Hair Out of Car Seats (and When to Call Us)*.
- **Meta description:** 130–160 characters. Answer the search and give a reason to click.
- **Length:** 900–1,500 words of body text. Long enough to be the best answer, with no padding.
- **Opening:** two to four short paragraphs that answer the question straight away. No `<h1>`, because the page adds the title.
- **Sections:** 4–7 `<h2>` sections, with `<h3>` inside where useful. Include at least one list or table.
- **A "how we do it" section:** what happens on our jobs, step by step, tied to the service. This is where the real photos go.
- **A DIY section** where it makes sense: what the reader can safely do themselves, and where DIY stops working.
- **FAQs:** 3–5 real questions people ask. Put them in `post.json → faq`, not in the body. The page renders them and adds FAQ structured data, so each answer must be 1–3 plain sentences.
- **Call to action:** set `post.json → cta` to the single most relevant service, with its URL from `facts.json`. Keep the heading short and the text to one or two sentences.

## Links

- 2–4 links in the body to MobilePitStop service pages, using URLs exactly as listed in `facts.json`. Link the words naturally ("an [Interior Deep Clean](…) starts with…"), not "click here".
- Link to earlier blog posts where they genuinely help (`/their-slug/`).
- Link to a town page only in local posts.
- External links are rare. Use them only for an official source (e.g. gov.uk), and add `rel="noopener"`.

## Local mentions

Mention the area where it's natural, for example "on the Wirral, salt on the roads from November…" or "after a day on Formby beach…". Use at most two town names in a normal post. Never use lists of towns or keyword stuffing.

## Images

Every post needs:

- **A hero image** (`hero.webp`, 16:9, 1600×900) shown at the top of the post and on the blog index. Use a real job photo (`npm run photo -- <photo> hero.webp --aspect 16:9`) or a before/after `pair` graphic. No text on the hero, because the page title sits right above it.
- **A social image** (`social.webp`, 1600×900) for link previews on Facebook, WhatsApp and so on: a `title` graphic with the post title over a job photo. Set `post.json → social.src`.
- **1–3 photos in the body** from Gab's library (`mobilepitstop-blog-library/photos.json`). Pick by tags, and prefer photos with an empty `used_in`.
- **One branded graphic in the body** where it helps: a `steps`, `table` or `checklist` graphic summarising the post.

Rules:

- Open every photo before using it. Blur any readable **number plate** or **house number** with `--blur`, and crop out people and customers' houses where you can. Skip photos flagged `plate-visible` unless you blur or crop the plate, and never use anything showing a person's face.
- **Never use AI-generated or stock photos.** Only Gab's real photos and our own graphics.
- Alt text describes what's actually in the picture, e.g. "Boot carpet covered in dog hair before an interior deep clean". Don't stuff keywords into it.
- Keep each image under 250 KB. The scripts already produce that.
- After the post is approved, add its slug to `used_in` for each photo in the library.

In `body.html`:

```html
<figure>
  <img src="pet-hair-before.webp" alt="Boot carpet covered in dog hair before cleaning" width="1600" height="1200">
  <figcaption>Before: a boot carpet after a few months of a dog travelling in it.</figcaption>
</figure>
```

## Files

Each post is a folder: `content/posts/<slug>/`

- `post.json`

  ```json
  {
    "title": "…",
    "status": "draft",
    "publishedAt": "2026-10-08T07:00:00Z",
    "language": "en",
    "meta_description": "…",
    "excerpt": "One or two sentences for the blog index.",
    "hero": { "src": "hero.webp", "alt": "…" },
    "social": { "src": "social.webp" },
    "keywords": ["main keyword", "secondary", "…"],
    "faq": [{ "q": "…", "a": "…" }],
    "cta": { "heading": "…", "text": "…", "buttonLabel": "See prices and book", "buttonUrl": "https://mobilepitstop.uk/…" },
    "plan_id": "dog-hair",
    "photos_used": ["P022", "P023"]
  }
  ```

- `body.html`. Allowed tags: `p h2 h3 ul ol li strong em a figure img figcaption table thead tbody tr th td blockquote`. No inline styles, no scripts, no `<h1>`.
- Image files: `hero.webp`, `social.webp`, plus anything the body uses. Don't repeat the hero photo in the body.

- **Slug:** lowercase words and dashes, based on the main keyword, with no dates. For example `get-dog-hair-out-of-car-seats`.
- **Status:** a post stays `"draft"` until Gab approves it. Approval flips it to `"published"` and sets `publishedAt` to the publish time.

Run `npm run check -- content/posts/<slug>` before showing a draft. Fix every error. Treat warnings as things to look at.
