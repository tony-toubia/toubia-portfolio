# /slt media assets

Optional files for the SLT Ventures page. Paths are declared in the `MEDIA`
block near the bottom of `../index.html`.

| File | Used by | `MEDIA` key | Currently |
| --- | --- | --- | --- |
| `hero.mp4` | Hero background video | `heroVideo` | **wired** – expects this file |
| `hero-poster.jpg` | First frame / slow connections | `heroPoster` | `null` |
| `testimonials.jpg` | Testimonial section background | `quotesImage` | `null` |

To enable one of the `null` entries, drop the file in and replace the `null`
with the commented-out path next to it. A key left `null` makes no request at
all, and the section renders its flat fallback.

`hero.mp4` is already wired. Until the file is committed here the browser logs
one 404 and the hero falls back to flat navy – the page still renders
correctly. A missing file or unsupported codec removes the video element
rather than leaving a broken frame.

## Transcode before committing

Stock footage is far too heavy to ship as-is. A 4K 60fps clip is typically
50–200 MB; GitHub warns above 50 MB and **rejects any file over 100 MB**, and
every visitor would pay for it on load. Transcode to roughly 1080p30 first –
expect to land around 1–3 MB.

```
ffmpeg -i "14672626_3840_2160_60fps.mp4" \
  -an -t 12 \
  -vf "scale=1920:-2,fps=30" \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p \
  -movflags +faststart \
  hero.mp4
```

- `-an` strips audio. The element is muted, so the track is dead weight.
- `-t 12` trims to the first 12 seconds. Pick a window that loops cleanly.
- `-crf 28` is deliberately aggressive. The video sits under a 74% navy scrim
  at low opacity, so compression artefacts are invisible in practice. Drop to
  24 if you disagree, and watch the file size.
- `+faststart` moves the index to the front so playback begins before the
  file finishes downloading.

Check the result before committing:

```
ls -lh hero.mp4          # aim for under 3 MB
```

A matching poster helps on slow connections:

```
ffmpeg -i hero.mp4 -frames:v 1 -q:v 4 hero-poster.jpg
```

Then set `heroPoster: '/slt/media/hero-poster.jpg'` in `index.html`.

## Choosing footage

The video sits behind white headline text under a 74% navy scrim. Slow,
low-contrast, low-detail motion works. Busy or bright footage fights the type
even through the scrim, and fast motion wastes bitrate.

Video is skipped entirely for visitors with `prefers-reduced-motion: reduce`;
they get the poster or the flat fallback.

## testimonials.jpg

- 2000px wide is ample. It is `cover` under a 78% navy scrim.
- Budget under 400 KB.
- Low-detail, mid-to-dark images work best. The testimonial card is a
  translucent navy panel, so the image reads around it.

## Rights

Use footage and photography the firm owns or has licensed for commercial web
use. Stock clips carry per-use terms and some prohibit use as a website
background.
