#!/usr/bin/env python3
"""Franklin by Numbers: turn the photos in scripts/franklin/photos into colour-by-number puzzles.

    pip install numpy opencv-python-headless pillow
    python scripts/franklin/build_puzzles.py [--only portrait] [--preview DIR]

A picture is made one of two ways (PUZZLES below).

From a line drawing (`art`: a colouring-page drawing of the photo in scripts/franklin/art): the areas between the
drawn lines become the regions, each takes its colour from the photo underneath, and the drawing itself is kept as
an overlay (<id>-art.webp) that the game draws on top of the paint. Numbers printed on the drawing are dropped.

From the photo alone, from the ground up, guided by shapes marked by hand:
  1. Franklin's outline: the marked polygon, snapped to the real edge in the photo.
  2. The big elements: ears, eyes, nose, mouth, tongue, paws, the cape, the ball. Each keeps its own outline.
  3. Shading: the fur, the cape and the background are each split into a few flat tones with large, smooth shapes.

Either way, regions too small to tap merge into a neighbour, and the result is traced into shared boundary chains,
so neighbouring regions meet exactly at any zoom.

Writes public/franklin/data/<id>.json, <id>-ref.webp (the photo, shown when the picture is finished) and
<id>-thumb.webp (line art for the gallery), plus index.json.

Puzzle JSON:
    { id, title, blurb, w, h, v (data version; saves made against another version are dropped),
      art: "<id>-art.webp" (only for pictures made from a drawing),
      palette: ["#rrggbb", ...],
      chains: [[kind, x0, y0, dx, dy, ...], ...]   kind: 0 smooth, 1 straight (image border), 2 smooth closed loop;
                                                   + 4 when the chain is an element's outline (drawn heavier)
      regions: [[colour, labelX, labelY, labelRadius, [[chainRef, ...], ...]], ...] }
A chainRef is the chain's index + 1, negative when the loop runs it backwards. Coordinates are in pixels of the
w × h working image; label positions and radii are in tenths of a pixel.
"""
import argparse
import hashlib
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'franklin', 'data')

# Pictures from a drawing:
#   art       crop: the part of the drawing to use, in its pixels (leaves out a frame or a colour key).
#             align: pairs of (drawing pixel, photo fraction) for the same spot, when the drawing is not a direct
#             trace of the photo; omit when the drawing covers the whole photo.
#             shade: points (fractions of the cropped drawing) inside big drawn areas to split into light and
#             shadow tones taken from the photo.
#   colors    palette size. min_area / min_radius: areas smaller than this merge into a neighbour.
# Pictures from the photo alone: all coordinates are fractions of the photo (x right, y down).
#   outline   Franklin's silhouette, clockwise. snap: how far (fraction of the long side) the real edge may be from it.
#   ears      polygons; fur that keeps its own outline.
#   features  (name, rule, (cx, cy, rx, ry)): 'dark' / 'light' = the darker / lighter pixels inside the ellipse,
#             'pink' = the pinker ones, 'shape' = the ellipse itself. Features sharing a name share a colour.
#   face      ellipses where shading keeps finer detail.
#   fur / bg / cape   number of tones for each. tone: gamma applied to the photo (under 1 brightens).
#   bg_sat    colour strength of the background tones (their average over many small things comes out muddy).
# ZONES: per zone, (shading blur as a fraction of the long side, min region area in px², min inscribed radius in px).
ZONES = dict(bg=(0.034, 4500, 19), body=(0.02, 950, 9.5), face=(0.0075, 170, 4.6))
PUZZLES = [
    dict(id='portrait', title='Good Boy', blurb='Franklin, keeping an eye on things.', size=1600, colors=14,
         art=dict(crop=(0, 0, 2000, 1395), shade=[(.30, .75), (.62, .30), (.24, .40), (.60, .62), (.45, .50), (.15, .60)])),
    dict(id='cape', title='Super Franklin', blurb='Not all heroes wear capes. This one does.', size=1100, fur=4, bg=3, cape=3, tone=0.62,
         outline=[(.04, .22), (.07, .14), (.13, .09), (.21, .065), (.29, .07), (.37, .10), (.43, .15), (.47, .145), (.52, .135),
                  (.58, .135), (.63, .15), (.67, .20), (.70, .25), (.69, .28), (.655, .275), (.645, .33), (.65, .40), (.67, .47),
                  (.69, .55), (.72, .62), (.78, .70), (.84, .80), (.90, .90), (.95, .975), (.95, 1), (.71, 1), (.66, .90),
                  (.60, .82), (.55, .75), (.50, .70), (.40, .60), (.27, .55), (.22, .48), (.16, .455), (.08, .49), (0, .51),
                  (0, .36), (.035, .30)],
         ears=[[(.41, .165), (.45, .19), (.44, .23), (.40, .26), (.365, .255), (.375, .20)],
               [(.60, .145), (.64, .16), (.68, .21), (.695, .26), (.67, .275), (.635, .25), (.61, .20)]],
         features=[('eye', 'dark', (.458, .312, .022, .03)), ('eye', 'dark', (.558, .305, .024, .032)), ('nose', 'dark', (.495, .44, .045, .055)),
                   ('mouth', 'dark', (.515, .53, .05, .045))],
         face=[(.52, .37, .13, .24)]),
    dict(id='sploot', title='The Sploot', blurb='Maximum floor contact achieved.', size=1600, colors=9,
         art=dict(crop=(73, 71, 1419, 1858),
                  align=[((760, 1590), (.505, .722)), ((252, 318), (.085, .1525)), ((188, 1390), (.035, .6485)), ((1320, 1470), (.96, .6756)),
                         ((790, 232), (.55, .1176)), ((478, 1348), (.30, .625)), ((1030, 1352), (.725, .6175))])),
    dict(id='leaves', title='Fetch Season', blurb='One dog, one ball, ten thousand leaves.', size=1100, fur=4, bg=4, snap=0.02, bg_sat=1.9,
         outline=[(.565, 0), (.60, 0), (.605, .07), (.65, .085), (.70, .11), (.73, .15), (.75, .19), (.76, .205), (.80, .24),
                  (.84, .28), (.865, .31), (.85, .315), (.80, .305), (.755, .30), (.745, .33), (.74, .38), (.73, .42), (.77, .40),
                  (.80, .44), (.82, .50), (.82, .57), (.80, .62), (.76, .66), (.735, .69), (.73, .75), (.71, .82), (.69, .87),
                  (.685, .92), (.66, .945), (.60, .94), (.545, .92), (.535, .895), (.56, .87), (.60, .865), (.605, .82),
                  (.61, .76), (.60, .71), (.55, .69), (.50, .685), (.455, .70), (.45, .76), (.45, .84), (.45, .92), (.455, 1),
                  (.375, 1), (.365, .90), (.35, .82), (.34, .75), (.32, .70), (.31, .66), (.295, .62), (.285, .55), (.275, .47),
                  (.275, .40), (.29, .34), (.305, .29), (.27, .27), (.25, .265), (.28, .24), (.33, .21), (.38, .195), (.42, .19),
                  (.40, .16), (.42, .12), (.46, .09), (.51, .075)],
         ears=[[(.42, .19), (.445, .21), (.43, .255), (.40, .28), (.35, .275), (.30, .265), (.255, .265), (.28, .24), (.33, .21), (.38, .195)],
               [(.70, .20), (.76, .205), (.80, .24), (.84, .28), (.865, .31), (.82, .31), (.77, .30), (.74, .285), (.715, .25)]],
         features=[('eye', 'dark', (.46, .312, .03, .025)), ('eye', 'dark', (.665, .325, .03, .025)), ('nose', 'dark', (.56, .42, .065, .05)),
                   ('mouth', 'dark', (.545, .53, .115, .085)), ('tongue', 'pink', (.54, .535, .068, .068)),
                   ('paw', 'light', (.58, .895, .05, .035)), ('ball', 'shape', (.265, .905, .062, .047))],
         face=[(.56, .42, .22, .20)]),
]


def poly_mask(pts, w, h):
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.array([(int(round(x * w)), int(round(y * h))) for x, y in pts], np.int32)], 255)
    return m > 0


def ellipse_mask(e, w, h):
    m = np.zeros((h, w), np.uint8)
    cv2.ellipse(m, (int(e[0] * w), int(e[1] * h)), (max(1, int(e[2] * w)), max(1, int(e[3] * h))), 0, 0, 360, 255, -1)
    return m > 0


def tidy(mask, sigma, keep=1):
    """Round a mask off and keep its `keep` largest pieces, holes filled."""
    m = (cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma) > 0.5).astype(np.uint8)
    num, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    order = np.argsort(-stats[1:, cv2.CC_STAT_AREA])[:keep] + 1
    m = np.isin(lab, order).astype(np.uint8)
    inv, lab2 = cv2.connectedComponents(1 - m, connectivity=4)
    edge = np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
    return (m > 0) | ~np.isin(lab2, edge)


def silhouette(bgr, outline, snap):
    """Franklin's outline: the marked polygon, moved onto the real edge (GrabCut) within `snap` pixels of it."""
    h, w = bgr.shape[:2]
    inside = poly_mask(outline, w, h)
    if snap < 2:
        return tidy(inside, 3)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(snap) * 2 + 1,) * 2)
    core = cv2.erode(inside.astype(np.uint8), k, borderValue=1) > 0
    far = cv2.dilate(inside.astype(np.uint8), k) == 0
    gc = np.where(inside, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    gc[core] = cv2.GC_FGD
    gc[far] = cv2.GC_BGD
    cv2.setRNGSeed(3)
    cv2.grabCut(cv2.bilateralFilter(bgr, 9, 50, 9), gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    return tidy((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 3.5)


def otsu(vals):
    t, _ = cv2.threshold(np.clip(vals, 0, 255).astype(np.uint8).reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return t


def masked_blur(lab, mask, sigma):
    """Blur within a mask only, so colours outside it do not bleed in."""
    m = mask.astype(np.float32)
    num = cv2.GaussianBlur(lab * m[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(m, (0, 0), sigma)
    return num / np.maximum(den, 1e-4)[..., None]


def tones(lab, mask, k, sigma, fine=None, fine_sigma=None, seed=7):
    """Split the masked pixels into k flat tones with large shapes. Returns (H×W tone index, k×3 Lab means)."""
    soft = masked_blur(lab, mask, sigma)
    if fine is not None:
        soft = soft * (1 - fine[..., None]) + masked_blur(lab, mask, fine_sigma) * fine[..., None]
    px = soft[mask]
    step = max(1, len(px) // 60000)
    cv2.setRNGSeed(seed)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.2)
    _, _, centres = cv2.kmeans(np.ascontiguousarray(px[::step]), k, None, crit, 8, cv2.KMEANS_PP_CENTERS)
    idx = np.zeros(mask.shape, np.int32)
    idx[mask] = ((px[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
    return idx, centres


def draw_classes(photo, cfg):
    """Steps 1 to 3. Returns (class map, element map, class Lab colours, zone maps (body, face), feature mask)."""
    h, w = photo.shape[:2]
    long = max(w, h)
    lab = cv2.cvtColor(cv2.bilateralFilter(photo, 9, 40, 9), cv2.COLOR_BGR2LAB).astype(np.float32)
    face = np.zeros((h, w), np.float32)
    for e in cfg.get('face', []):
        face = np.maximum(face, ellipse_mask(e, w, h).astype(np.float32))
    face = cv2.GaussianBlur(face, (0, 0), 0.012 * long)

    # 1. the outline
    dog = silhouette(photo, cfg['outline'], cfg.get('snap', 0.028) * long)
    cape = np.zeros((h, w), bool)
    if cfg.get('cape'):
        blue = (lab[..., 2] < 112) & (lab[..., 0] > 18)
        cape = tidy(blue, 3, keep=3)
    subject = dog | cape

    classes = np.zeros((h, w), np.int32)      # colour class per pixel
    element = np.zeros((h, w), np.int32)      # 0 background, 1 fur, 2+ ears / cape / features
    colours = []                              # Lab per class

    def add_tones(mask, k, sigma, el, fine=None):
        idx, centres = tones(lab, mask, k, sigma * long, fine, ZONES['face'][0] * long)
        classes[mask] = idx[mask] + len(colours)
        element[mask] = el
        colours.extend(centres.tolist())

    # 3. shading (laid down first; the elements are stamped over it)
    add_tones(~subject, cfg['bg'], ZONES['bg'][0], 0)
    fur = dog & ~cape
    add_tones(fur, cfg['fur'], ZONES['body'][0], 1, face)
    next_el = 2
    for ear in cfg.get('ears', []):
        element[poly_mask(ear, w, h) & fur] = next_el
        next_el += 1
    if cape.any():
        add_tones(cape, cfg['cape'], ZONES['body'][0] * 0.8, next_el)
        next_el += 1

    # 2. the big elements
    stamped = np.zeros((h, w), bool)
    by_name = {}
    for name, rule, e in cfg.get('features', []):
        zone = ellipse_mask(e, w, h)
        if rule == 'shape':
            m = zone
        else:
            zone &= subject & ~stamped
            L, B = lab[..., 0], lab[..., 2]
            if rule == 'dark':
                m = zone & (L < otsu(L[zone]))
            elif rule == 'light':
                m = zone & (L > otsu(L[zone]))
            else:                              # pink: less yellow than the fur around it
                m = zone & (B < otsu(B[zone]))
            m = tidy(m, 2.2) & zone
        if m.sum() < 40:
            continue
        by_name.setdefault(name, []).append(m)
        stamped |= m
    for name, masks in by_name.items():
        both = np.logical_or.reduce(masks)
        colours.append(lab[both].mean(0).tolist())
        for m in masks:
            classes[m] = len(colours) - 1
            element[m] = next_el
            next_el += 1
    body = cv2.GaussianBlur(subject.astype(np.float32), (0, 0), 2)
    return classes, element, np.array(colours, np.float32), body, face, stamped


def from_art(cfg):
    """A picture from a line drawing. Returns (key map, class Lab colours, photo fitted to the drawing, overlay):
    overlay is {rgba: the drawing as black with alpha, at its own size; ink: where its lines are, at working size}."""
    spec = cfg['art']
    art = cv2.imread(os.path.join(HERE, 'art', cfg['id'] + '.jpg'))
    photo = cv2.imread(os.path.join(HERE, 'photos', cfg['id'] + '.jpg'))
    if art is None or photo is None:
        sys.exit('missing the drawing or the photo for ' + cfg['id'])
    full_h, full_w = art.shape[:2]
    x0, y0, x1, y1 = spec['crop']
    art = art[y0:y1, x0:x1]
    scale = cfg['size'] / max(art.shape[:2])
    w, h = int(round(art.shape[1] * scale)), int(round(art.shape[0] * scale))
    ph, pw = photo.shape[:2]
    if spec.get('align'):
        src = np.array([[fx * pw, fy * ph] for _, (fx, fy) in spec['align']], np.float64)
        dst = np.array([[ax - x0, ay - y0] for (ax, ay), _ in spec['align']], np.float64)
        m = np.linalg.lstsq(np.hstack([src, np.ones((len(src), 1))]), dst, rcond=None)[0].T
    else:
        m = np.array([[full_w / pw, 0, -x0], [0, full_h / ph, -y0]], np.float64)
    photo = cv2.warpAffine(photo, m * scale, (w, h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)

    # The drawn lines are near black; the numbers printed on the drawing are light grey and fall away.
    grey = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY)
    alpha = np.clip((165 - grey.astype(np.float32)) / 110, 0, 1)
    overlay = np.zeros(art.shape[:2] + (4,), np.uint8)
    overlay[..., 3] = (alpha * 255).astype(np.uint8)
    ink = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_AREA) > 0.3
    ink = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0          # closes hairline gaps
    num, lab_free, stats, _ = cv2.connectedComponentsWithStats((~ink).astype(np.uint8), connectivity=4)
    speck = np.isin(lab_free, np.flatnonzero(stats[:, cv2.CC_STAT_AREA] < 30))
    free = ~ink & ~speck
    # Every ink pixel joins the nearest area, so the areas meet under the lines.
    _, nearest = cv2.distanceTransformWithLabels((~free).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(int(nearest.max()) + 1, np.int32)
    lut[nearest[free]] = lab_free[free]
    area_id = lut[nearest]
    ids, area_id = np.unique(area_id, return_inverse=True)
    area_id = area_id.reshape(h, w).astype(np.int32)
    n = len(ids)

    lab = cv2.cvtColor(cv2.bilateralFilter(photo, 9, 40, 9), cv2.COLOR_BGR2LAB).astype(np.float32)
    flat = area_id.ravel()
    size_all = np.bincount(flat, minlength=n)

    # Shading: the drawn areas named in `shade` (Franklin's coat, where the drawing leaves one big open area) are
    # split into a few flat tones. Those boundaries have no drawn line, so build() adds a light one to the overlay.
    long = max(w, h)
    tone = np.zeros((h, w), np.int32)
    split = np.zeros((h, w), bool)
    for fx, fy in spec.get('shade', []):
        a = int(area_id[int(fy * h), int(fx * w)])
        mask = area_id == a
        if split[mask].any() or size_all[a] < 0.008 * h * w:
            continue
        idx, _ = tones(lab, mask, 4 if size_all[a] > 0.09 * h * w else 3, 0.016 * long)
        tone[mask] = idx[mask]
        split |= mask
    piece, n = components(area_id * 8 + tone)
    owner = np.zeros(n, np.int64)
    owner[piece.ravel()] = flat

    # Colour: the photo under each piece (its inside, away from the lines), reduced to a small palette.
    inner = cv2.erode(free.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    flat = piece.ravel()
    size_all = np.bincount(flat, minlength=n)
    cnt = np.bincount(flat, weights=inner.ravel().astype(np.float64), minlength=n)
    mean = np.zeros((n, 3), np.float32)
    for c in range(3):
        some = np.bincount(flat, weights=(lab[..., c] * inner).ravel(), minlength=n) / np.maximum(cnt, 1)
        every = np.bincount(flat, weights=lab[..., c].ravel(), minlength=n) / size_all
        mean[:, c] = np.where(cnt >= 12, some, every)
    sample = np.repeat(mean, np.clip(size_all // 1500, 1, 60), axis=0)
    cv2.setRNGSeed(7)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 80, 0.1)
    _, _, centres = cv2.kmeans(np.ascontiguousarray(sample), cfg['colors'], None, crit, 10, cv2.KMEANS_PP_CENTERS)
    cls = ((mean[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
    key = ((owner + 1) * 1000 + cls)[piece]
    # Thresholds for merging: drawn areas may be small; shading pieces must be big.
    area_map = np.where(split, 0.0034 * h * w, float(cfg.get('min_area', 330))).astype(np.float32)
    radius_map = np.where(split, 0.0085 * long, float(cfg.get('min_radius', 5.2))).astype(np.float32)
    key = merge_small(key, centres, area_map, radius_map, np.zeros((h, w), bool))
    return key, centres, photo, dict(rgba=overlay, ink=ink)


def majority(labels, sigma, fine=None):
    """Smooth the boundaries: every pixel takes the label most common around it. Where `fine` (0..1) is set, a
    third of the radius is used, so small features there survive."""
    best = np.full(labels.shape, -1.0, np.float32)
    out = np.zeros(labels.shape, labels.dtype)
    for c in np.unique(labels):
        one = (labels == c).astype(np.float32)
        m = cv2.GaussianBlur(one, (0, 0), sigma)
        if fine is not None:
            m = m * (1 - fine) + cv2.GaussianBlur(one, (0, 0), sigma / 3) * fine
        better = m > best
        best[better] = m[better]
        out[better] = c
    return out


def components(cmap):
    """4-connected regions of equal value. Returns (H×W region id, region count)."""
    h, w = cmap.shape
    flat = cmap.ravel()
    order = np.argsort(flat, kind='stable')
    vals = flat[order]
    starts = np.flatnonzero(np.r_[True, vals[1:] != vals[:-1]])
    ys, xs = np.divmod(order, w)
    y0, y1 = np.minimum.reduceat(ys, starts), np.maximum.reduceat(ys, starts)
    x0, x1 = np.minimum.reduceat(xs, starts), np.maximum.reduceat(xs, starts)
    reg = np.zeros(cmap.shape, np.int32)
    n = 0
    for v, a, b, c, d in zip(vals[starts].tolist(), y0.tolist(), y1.tolist(), x0.tolist(), x1.tolist()):
        num, lab = cv2.connectedComponents((cmap[a:b + 1, c:d + 1] == v).astype(np.uint8), connectivity=4)
        m = lab > 0
        reg[a:b + 1, c:d + 1][m] = lab[m] - 1 + n
        n += num - 1
    return reg, n


def inscribed(reg, n):
    """Per region: the pixel farthest from the region's edge, and that distance (the label spot and its room)."""
    p = np.pad(reg, 1, constant_values=-1)
    c = p[1:-1, 1:-1]
    interior = (c == p[:-2, 1:-1]) & (c == p[2:, 1:-1]) & (c == p[1:-1, :-2]) & (c == p[1:-1, 2:])
    dist = cv2.distanceTransform(interior.astype(np.uint8), cv2.DIST_L2, 5) + 0.5
    flat_r, flat_d = reg.ravel(), dist.ravel()
    order = np.lexsort((flat_d, flat_r))
    last = np.flatnonzero(np.r_[flat_r[order][1:] != flat_r[order][:-1], True])
    at = order[last]                                   # one pixel per region, in region order
    rad = flat_d[at]
    ys, xs = np.unravel_index(at, reg.shape)
    assert len(at) == n
    return xs, ys, rad


def borders(reg, n):
    """{region: {neighbour: shared border length}}."""
    pairs = []
    for a, b in ((reg[:, :-1], reg[:, 1:]), (reg[:-1, :], reg[1:, :])):
        m = a != b
        pairs.append(a[m].astype(np.int64) * n + b[m])
        pairs.append(b[m].astype(np.int64) * n + a[m])
    codes, counts = np.unique(np.concatenate(pairs), return_counts=True)
    out = {}
    for code, cnt in zip(codes.tolist(), counts.tolist()):
        out.setdefault(code // n, {})[code % n] = cnt
    return out


def merge_small(key, colours, area_map, radius_map, keep):
    """Merge regions too small to tap into the neighbour they share most border with. A neighbour in the same
    element and of a nearer colour is preferred, and the background and Franklin rarely swallow each other, so his
    outline stays put. `key` is element × 1000 + colour class; regions mostly inside `keep` (the features) are left
    alone. area_map / radius_map give the thresholds per pixel (they differ by zone); a region uses its average."""
    for _ in range(80):
        reg, n = components(key)
        flat = reg.ravel()
        area = np.bincount(flat, minlength=n)
        _, _, rad = inscribed(reg, n)
        min_area = np.bincount(flat, weights=area_map.ravel(), minlength=n) / area
        min_radius = np.bincount(flat, weights=radius_map.ravel(), minlength=n) / area
        kept = (np.bincount(flat, weights=keep.ravel().astype(np.float64), minlength=n) / area > 0.5) & (area >= 40)
        small = np.flatnonzero(((area < min_area) | (rad < min_radius)) & ~kept)
        if not len(small):
            return key
        first = np.zeros(n, np.int64)
        first[flat[::-1]] = np.arange(reg.size)[::-1]
        rkey = key.ravel()[first]
        nb = borders(reg, n)
        new = rkey.copy()
        frozen = set()
        for s in sorted(small.tolist(), key=lambda r: area[r]):
            if s in frozen or s not in nb:
                continue
            best, score = None, -1
            for t, length in nb[s].items():
                de = float(np.linalg.norm(colours[rkey[s] % 1000] - colours[rkey[t] % 1000]))
                sc = length / (1 + de / 25)
                es, et = rkey[s] // 1000, rkey[t] // 1000
                if es == et:
                    sc *= 3
                elif (es == 0) != (et == 0) or kept[t]:
                    sc *= 0.12
                if sc > score:
                    best, score = t, sc
            new[s] = rkey[best]
            frozen.add(best)
            frozen.add(s)
        key = new[reg]
    return key


def trace(reg, n):
    """Trace region boundaries on the pixel-corner grid into chains shared by the two regions on either side.

    Returns (chains, loops): chains is a list of (points, on_image_border, closed); loops[r] is a list of loops, each
    a list of signed chain refs (index + 1, negative = backwards)."""
    h, w = reg.shape
    p = np.pad(reg, 1, constant_values=-1)
    # Boundary unit edges. he[y, x]: corner (x, y) → (x + 1, y). ve[y, x]: corner (x, y) → (x, y + 1).
    he = p[:-1, 1:-1] != p[1:, 1:-1]          # (h + 1) × w
    ve = p[1:-1, :-1] != p[1:-1, 1:]          # h × (w + 1)
    deg = np.zeros((h + 1, w + 1), np.int8)
    deg[:, :-1] += he
    deg[:, 1:] += he
    deg[:-1, :] += ve
    deg[1:, :] += ve
    junction = deg >= 3
    junction[0, 0] = junction[0, w] = junction[h, 0] = junction[h, w] = True   # the picture's edges stay straight

    def px(x, y):                              # region of pixel (x, y), -1 outside
        return p[y + 1, x + 1]

    # Directed unit edges with the region on the left. Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y (y down), so the
    # pixel on the left of an edge leaving corner (x, y) is: +x → (x, y - 1), +y → (x, y), -x → (x - 1, y), -y → (x - 1, y - 1).
    DX, DY = (1, 0, -1, 0), (0, 1, 0, -1)
    LEFT = ((0, -1), (0, 0), (-1, 0), (-1, -1))
    visited = np.zeros((4, h + 1, w + 1), bool)
    chains, key, loops = [], {}, [[] for _ in range(n)]

    def chain_ref(pts, closed):
        k = (pts[0], pts[1])
        if k in key:
            return key[k]
        cid = len(chains) + 1
        chains.append(pts)
        key[k] = cid
        key[(pts[-1], pts[-2])] = -cid
        return cid

    starts = []
    ys, xs = np.nonzero(he)                    # region below a horizontal edge → walk -x with it on the left
    for y, x in zip(ys.tolist(), xs.tolist()):
        if y > 0:
            starts.append((x, y, 0))           # region above: pixel (x, y - 1) is left of +x from (x, y)
        if y < h:
            starts.append((x + 1, y, 2))       # region below: pixel (x, y) is left of -x from (x + 1, y)
    ys, xs = np.nonzero(ve)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if x < w:
            starts.append((x, y, 1))           # region right of the edge: pixel (x, y) is left of +y from (x, y)
        if x > 0:
            starts.append((x, y + 1, 3))       # region left: pixel (x - 1, y) is left of -y from (x, y + 1)

    for sx, sy, sd in starts:
        if visited[sd, sy, sx]:
            continue
        r = px(sx + LEFT[sd][0], sy + LEFT[sd][1])
        x, y, d = sx, sy, sd
        pts = []
        while not visited[d, y, x]:
            visited[d, y, x] = True
            pts.append((x, y))
            x, y = x + DX[d], y + DY[d]
            # Keep the region on the left: turn left if the pixel ahead-left is not ours, else go straight if the
            # pixel ahead-right is not ours, else turn right. (Left first: 4-connected regions never cross a corner.)
            for nd in ((d + 3) % 4, d, (d + 1) % 4):
                rt = LEFT[(nd + 1) % 4]        # the pixel on the right of an edge is the left of the next direction
                if px(x + LEFT[nd][0], y + LEFT[nd][1]) == r and px(x + rt[0], y + rt[1]) != r:
                    d = nd
                    break
            else:
                raise RuntimeError('lost the boundary')
        # Cut the closed loop at junctions into chains.
        cut = [i for i, (vx, vy) in enumerate(pts) if junction[vy, vx]]
        refs = []
        if not cut:
            i0 = min(range(len(pts)), key=lambda i: (pts[i][1], pts[i][0]))
            ring = pts[i0:] + pts[:i0] + [pts[i0]]
            refs.append(chain_ref(ring, True))
        else:
            ring = pts[cut[0]:] + pts[:cut[0]]
            idx = [c - cut[0] for c in cut] + [len(ring)]
            ring = ring + [ring[0]]
            for a, b in zip(idx[:-1], idx[1:]):
                refs.append(chain_ref(ring[a:b + 1], False))
        loops[r].append(refs)

    info = []
    for pts in chains:
        closed = pts[0] == pts[-1]
        on_border = all((x == 0 or x == w) for x, _ in pts) or all((y == 0 or y == h) for _, y in pts)
        info.append((pts, on_border, closed))
    return info, loops


def simplify(pts, eps):
    """Douglas–Peucker on an open polyline (ends kept)."""
    pts = np.asarray(pts, np.float32).reshape(-1, 1, 2)
    return cv2.approxPolyDP(pts, eps, False).reshape(-1, 2).astype(int).tolist()


def simplify_chain(pts, closed, eps):
    if len(pts) <= 2:
        return [list(q) for q in pts]
    if not closed:
        return simplify(pts, eps)
    body = np.asarray(pts[:-1])
    far = int(((body - body[0]) ** 2).sum(1).argmax())
    a = simplify(pts[:far + 1], eps)
    b = simplify(pts[far:], eps)
    return a + b[1:]


def curve(pts, closed):
    """The smooth curve the game draws through a chain's points (quadratics through the segment midpoints)."""
    p = np.asarray(pts, np.float32)
    t = np.linspace(0, 1, 7)[1:, None]
    if closed:
        q = p[:-1]
        m = len(q)
        out = [(q[0] + q[1 % m]) / 2]
        for i in range(1, m + 1):
            a, c, b = out[-1], q[i % m], (q[i % m] + q[(i + 1) % m]) / 2
            out.extend(((1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b).tolist())
        return np.asarray(out, np.float32)
    if len(p) < 3:
        return p
    out = [p[0], (p[0] + p[1]) / 2]
    for i in range(1, len(p) - 1):
        a, c, b = np.asarray(out[-1]), p[i], (p[i] + p[i + 1]) / 2
        out.extend(((1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b).tolist())
    out.append(p[-1])
    return np.asarray(out, np.float32)


def from_photo(cfg):
    """A picture drawn from the photo alone. Returns (key map, class Lab colours, photo)."""
    src = os.path.join(HERE, 'photos', cfg['id'] + '.jpg')
    photo = cv2.imread(src)
    if photo is None:
        sys.exit('missing ' + src)
    scale = cfg['size'] / max(photo.shape[:2])
    w, h = int(round(photo.shape[1] * scale)), int(round(photo.shape[0] * scale))
    photo = cv2.resize(photo, (w, h), interpolation=cv2.INTER_AREA)
    if cfg.get('tone'):
        lut = (np.linspace(0, 1, 256) ** cfg['tone'] * 255).astype(np.uint8)
        photo = cv2.LUT(photo, lut)

    classes, element, colours, body, face, stamped = draw_classes(photo, cfg)
    key = element * 1000 + classes

    def by_zone(i):
        m = ZONES['bg'][i] * (1 - body) + ZONES['body'][i] * body
        return m * (1 - face) + ZONES['face'][i] * face

    area_map, radius_map = by_zone(1), by_zone(2)
    for sigma in (4.0, 2.4):
        smooth = majority(key, sigma, face)
        smooth[stamped] = key[stamped]         # the features keep the shape they were given
        key = merge_small(smooth, colours, area_map, radius_map, stamped)
    return key, colours, photo


def build(cfg, preview=None):
    overlay = None
    if cfg.get('art'):
        key, colours, photo, overlay = from_art(cfg)
    else:
        key, colours, photo = from_photo(cfg)
    h, w = key.shape
    reg, n = components(key)
    first = np.zeros(n, np.int64)
    first[reg.ravel()[::-1]] = np.arange(reg.size)[::-1]
    rkey = key.ravel()[first]
    rclass, relement = rkey % 1000, rkey // 1000

    # Palette: a class takes the mean colour of the photo under it. Near-identical classes share a number, and the
    # numbers run from light to dark.
    lab = cv2.cvtColor(cv2.bilateralFilter(photo, 9, 40, 9), cv2.COLOR_BGR2LAB).astype(np.float32)
    cmap = key % 1000
    used = np.unique(cmap).tolist()
    mean = {c: lab[cmap == c].mean(0) for c in used}
    size = {c: int((cmap == c).sum()) for c in used}
    if cfg.get('bg_sat'):
        for c in np.unique(cmap[key // 1000 == 0]).tolist():
            mean[c][1:] = 128 + (mean[c][1:] - 128) * cfg['bg_sat']
    group = {c: c for c in used}
    for c in sorted(used, key=lambda c: -size[c]):
        for d in used:
            if group[d] == d and d != c and group[c] == c and size[d] >= size[c] and np.linalg.norm(mean[c] - mean[d]) < 7.5:
                group[c] = d
                break
    roots = sorted({group[c] for c in used}, key=lambda c: -mean[c][0])
    number = {c: roots.index(group[c]) for c in used}
    hsv = cv2.cvtColor(cv2.cvtColor(np.array([mean[c] for c in roots], np.float32).astype(np.uint8).reshape(1, -1, 3), cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.14, 0, 255)
    rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).reshape(-1, 3)
    palette = ['#%02x%02x%02x' % tuple(int(v) for v in c) for c in rgb]
    colour = np.array([number[c] for c in rclass.tolist()])
    lx, ly, rad = inscribed(reg, n)

    chains, loops = trace(reg, n)
    sides = {}
    for r, rl in enumerate(loops):
        for loop in rl:
            for ref in loop:
                sides.setdefault(abs(ref) - 1, []).append(r)
    out_chains = []
    extra = None
    if overlay is not None:
        up = overlay['rgba'].shape[1] / w
        extra = np.zeros(overlay['rgba'].shape[:2], np.uint8)
    for i, (pts, on_border, closed) in enumerate(chains):
        s = simplify_chain(pts, closed, 0.5 if on_border else (1.0 if overlay is not None else 1.6))
        kind = 1 if on_border else (2 if closed else 0)
        rs = sides.get(i, [])
        if overlay is None and len(rs) == 2 and relement[rs[0]] != relement[rs[1]]:
            kind += 4                           # an element's outline
        if overlay is not None and not on_border:
            # A boundary the drawing has no line for (shading, or two areas that merged around a gap): draw one.
            pa = np.asarray(pts)
            on_ink = overlay['ink'][np.clip(pa[:, 1], 0, h - 1), np.clip(pa[:, 0], 0, w - 1)].mean()
            if on_ink < 0.5:
                cv2.polylines(extra, [np.round(curve(s, closed) * up * 16).astype(np.int32)], closed, 255, 2, cv2.LINE_AA, 4)
        flat_pts = [kind, s[0][0], s[0][1]]
        for a, b in zip(s[:-1], s[1:]):
            flat_pts += [b[0] - a[0], b[1] - a[1]]
        out_chains.append(flat_pts)
    if overlay is not None:
        rgba = overlay['rgba']
        rgba[..., 3] = np.maximum(rgba[..., 3], (extra * 0.62).astype(np.uint8))
        overlay = rgba
    regions = [[int(colour[r]), int(round((lx[r] + 0.5) * 10)), int(round((ly[r] + 0.5) * 10)), int(round(rad[r] * 10)), loops[r]]
               for r in range(n)]

    body = dict(id=cfg['id'], title=cfg['title'], blurb=cfg['blurb'], w=w, h=h, palette=palette, chains=out_chains, regions=regions)
    if overlay is not None:
        body['art'] = cfg['id'] + '-art.webp'
        Image.fromarray(overlay, 'RGBA').save(os.path.join(OUT, body['art']), quality=82, method=6)
    text = json.dumps(body, separators=(',', ':'))
    body['v'] = hashlib.sha1(text.encode()).hexdigest()[:10]
    text = json.dumps(body, separators=(',', ':'))
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, cfg['id'] + '.json'), 'w') as f:
        f.write(text)

    # The finished-picture photo and the gallery line art.
    Image.fromarray(cv2.cvtColor(photo, cv2.COLOR_BGR2RGB)).save(os.path.join(OUT, cfg['id'] + '-ref.webp'), quality=80, method=6)
    def edges(m):
        pad = np.pad(m, 1, mode='edge')
        return (m != pad[:-2, 1:-1]) | (m != pad[1:-1, :-2])

    edge = edges(reg)
    if overlay is not None:
        line = 255 - (cv2.resize(overlay[..., 3], (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) * 0.82).astype(np.uint8)
    else:
        line = np.full((h, w), 255, np.uint8)
        line[cv2.dilate(edge.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0] = 150
        line[cv2.dilate(edges(relement[reg]).astype(np.uint8), np.ones((4, 4), np.uint8)) > 0] = 60
    t = 420 / max(w, h)
    bold = cv2.erode(line, np.ones((4, 4), np.uint8)) if overlay is not None else line   # thin drawn lines survive the shrink
    thumb = cv2.resize(bold, (int(w * t), int(h * t)), interpolation=cv2.INTER_AREA)
    Image.fromarray(thumb).save(os.path.join(OUT, cfg['id'] + '-thumb.webp'), quality=80, method=6)

    if preview:
        os.makedirs(preview, exist_ok=True)
        painted = cv2.cvtColor(rgb[colour[reg]].astype(np.uint8), cv2.COLOR_RGB2BGR)
        if overlay is not None:
            painted = (painted * (line[..., None] / 255.0)).astype(np.uint8)
        cv2.imwrite(os.path.join(preview, cfg['id'] + '-painted.png'), painted)
        cv2.imwrite(os.path.join(preview, cfg['id'] + '-lines.png'), line)

    per = np.bincount(colour, minlength=len(palette))
    small = int((rad < 6).sum())
    print(f"{cfg['id']}: {w}×{h}, {n} regions, {len(palette)} colours, {len(out_chains)} chains, "
          f"{sum((len(c) - 1) // 2 for c in out_chains)} points, {len(text) // 1024} KB; "
          f"regions per colour {per.min()}–{per.max()}; {small} with radius under 6 px")
    return dict(id=cfg['id'], title=cfg['title'], blurb=cfg['blurb'], w=w, h=h, regions=n, colors=len(palette), v=body['v'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--preview')
    args = ap.parse_args()
    index = []
    for cfg in PUZZLES:
        if args.only and cfg['id'] != args.only:
            continue
        index.append(build(cfg, args.preview))
    if not args.only:
        with open(os.path.join(OUT, 'index.json'), 'w') as f:
            json.dump(index, f, separators=(',', ':'))


if __name__ == '__main__':
    main()
