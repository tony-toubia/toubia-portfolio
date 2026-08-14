# /slt media assets

The SLT Ventures page looks for three optional files in this folder. It probes
for each one with a `HEAD` request before using it, so **nothing here is
required** – if a file is absent the page falls back to a flat treatment and
makes no request for it. Drop a file in and it is picked up on the next load;
no code change needed.

| File | Used by | Fallback when absent |
| --- | --- | --- |
| `hero.mp4` | Hero background video | Flat navy hero (`#0b1221`) |
| `hero-poster.jpg` | First frame / slow connections | Flat navy hero |
| `testimonials.jpg` | Testimonial section background | Flat `#0d1524` |

## hero.mp4

- **Aspect / size:** 16:9, 1920×1080 is plenty. It is `object-fit: cover`, so
  keep the subject centred – the edges get cropped on narrow viewports.
- **Length:** 8–15 seconds, seamlessly loopable.
- **Encoding:** H.264 (`libx264`), `yuv420p` pixel format, `+faststart` so it
  begins playing before it fully downloads.
- **Budget:** aim for **under 3 MB**. This is a background element and every
  visitor pays for it. Strip the audio track entirely – the element is muted.
- **Content:** it sits behind white headline text under a 74% navy scrim, so
  favour slow, low-contrast, low-detail motion. Busy or bright footage will
  fight the type even through the scrim.

Example encode:

```
ffmpeg -i source.mov -an -vf "scale=1920:-2" -c:v libx264 -crf 26 \
       -preset slow -pix_fmt yuv420p -movflags +faststart hero.mp4
```

Video is skipped entirely for visitors with `prefers-reduced-motion: reduce`;
they get the poster or the flat fallback.

## hero-poster.jpg

Single frame from the video, same dimensions, JPEG quality ~75. Under 200 KB.

## testimonials.jpg

- **Size:** 2000px wide is ample; it is `cover` and sits under a 78% navy scrim.
- **Budget:** under 400 KB.
- **Content:** low-detail and mid-to-dark works best. The testimonial cards
  themselves are translucent navy panels, so the image reads around and behind
  them rather than through them.

## A note on rights

Use footage and photography the firm owns or has licensed for commercial web
use. Stock clips carry per-use terms and some prohibit use as a website
background.
