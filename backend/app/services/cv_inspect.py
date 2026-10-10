"""Fabric image anomaly BASELINE (classical computer vision, no trained model).

IMPORTANT - honesty notes surfaced in the UI and API:
- This is NOT a trained or validated defect detector. No fabric-defect model or labelled
  dataset was available, so it compares each region of the image with the fabric's own
  typical texture and colour and flags statistical outliers.
- `anomaly_score` is a heuristic severity (multiples of the image's own robust spread).
  It is not a probability, and LoomIQ never reports it as model confidence.
- Bounding boxes are the actual connected regions found by the analysis, so they are drawn
  in the UI; the defect type is a rule-based guess and must be confirmed by an inspector.

Checks
1. Dark/bright spots (hole, slub, oil): grey-level deviation from a heavy median background.
2. Colour deviation (stain / shade variation): Lab distance from the fabric's median colour.
3. Texture irregularity (weave fault): block-wise local std-dev outliers.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

ANALYSIS_VERSION = "loomiq-cv-baseline-0.3 (classical CV, unvalidated)"
MAX_SIDE = 1024


@dataclass
class Region:
    type: str  # spot | colour | texture
    bbox: list[int]       # x, y, w, h in ORIGINAL image pixels
    area_px: int
    score: float
    explanation: str

    def as_dict(self):
        return {"type": self.type, "bbox": self.bbox, "area_px": self.area_px,
                "score": round(self.score, 2), "explanation": self.explanation}


def _robust_z(x: np.ndarray, ref: np.ndarray | None = None) -> np.ndarray:
    ref = x if ref is None else ref
    med = np.median(ref)
    mad = np.median(np.abs(ref - med)) * 1.4826 + 1e-6
    return (x - med) / mad


def _components(mask: np.ndarray, zmap: np.ndarray, min_area: int, scale: float, kind: str,
                explain) -> list[Region]:
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        score = min(99.0, float(np.abs(zmap[labels == i]).mean()))   # capped for display
        s = 1.0 / scale
        out.append(Region(kind, [int(x * s), int(y * s), int(w * s), int(h * s)], int(area * s * s), score,
                          explain(score)))
    return out


def analyse(image_bytes: bytes) -> dict:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("The file could not be decoded as an image")
    H, W = img.shape[:2]
    if min(H, W) < 64:
        raise ValueError("Image is too small for analysis (minimum 64 x 64 px)")
    scale = min(1.0, MAX_SIDE / max(H, W))
    small = cv2.resize(img, (int(W * scale), int(H * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else img
    h, w = small.shape[:2]
    min_area = max(30, int(h * w * 0.0004))
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # 1. spot defects vs. smoothed background (removes the regular weave pattern)
    k = max(15, (min(h, w) // 12) | 1)
    bg = cv2.medianBlur(gray.astype(np.uint8), k).astype(np.float32)
    detail = cv2.GaussianBlur(gray - bg, (0, 0), 2.0)
    z_spot = _robust_z(detail)
    spot_mask = np.abs(z_spot) > 6.0
    regions = _components(spot_mask, z_spot, min_area, scale, "spot",
                          lambda s: f"Region {s:.1f}x darker/brighter than the fabric's typical variation "
                                    f"(possible hole, slub, knot or oil spot)")

    # 2. colour deviation in Lab
    lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_s = cv2.GaussianBlur(lab, (0, 0), 4.0)
    med = np.median(lab_s.reshape(-1, 3), axis=0)
    dist = np.linalg.norm((lab_s - med)[..., 1:], axis=2) + 0.5 * np.abs(lab_s[..., 0] - med[0])
    z_col = _robust_z(dist)
    col_mask = (z_col > 7.0) & (dist > 12.0)
    for c in _components(col_mask, z_col, min_area * 2, scale, "colour",
                         lambda s: f"Colour differs from the fabric's median shade by {s:.1f} robust units "
                                   f"(possible stain or shade variation)"):
        if not any(_iou(c.bbox, r.bbox) > 0.5 for r in regions):   # a hole also shifts colour; keep one box
            regions.append(c)

    # 3. texture irregularity via block std-dev
    b = max(16, min(h, w) // 24)
    gh, gw = h // b, w // b
    tex_regions: list[Region] = []
    if gh >= 4 and gw >= 4:
        blocks = gray[:gh * b, :gw * b].reshape(gh, b, gw, b).std(axis=(1, 3))
        z_tex = _robust_z(blocks)
        tmask = np.abs(z_tex) > 5.0
        up = cv2.resize(tmask.astype(np.uint8), (gw * b, gh * b), interpolation=cv2.INTER_NEAREST)
        zup = cv2.resize(z_tex.astype(np.float32), (gw * b, gh * b), interpolation=cv2.INTER_NEAREST)
        full = np.zeros((h, w), np.uint8)
        full[:gh * b, :gw * b] = up
        zfull = np.zeros((h, w), np.float32)
        zfull[:gh * b, :gw * b] = zup
        tex_regions = _components(full, zfull, b * b, scale, "texture",
                                  lambda s: f"Weave texture variation {s:.1f}x outside the fabric's normal range "
                                            f"(possible broken end/pick, float or irregular weaving)")
    # texture boxes that just duplicate a spot are dropped
    for t in tex_regions:
        if not any(_iou(t.bbox, r.bbox) > 0.2 for r in regions):
            regions.append(t)

    regions.sort(key=lambda r: -r.score)
    regions = regions[:12]
    worst = max((r.score for r in regions), default=0.0)
    defect_area_pct = 100.0 * sum(r.area_px for r in regions) / float(H * W)
    type_names = {"spot": "hole / spot", "colour": "stain / shade variation", "texture": "irregular weaving"}
    suggested = sorted({type_names[r.type] for r in regions})
    outcome = "defect_suspected" if regions else "pass"
    return {
        "analysis_version": ANALYSIS_VERSION,
        "outcome": outcome,
        "suggested_defects": [r.as_dict() for r in regions],
        "suggested_labels": suggested,
        "anomaly_score": round(worst, 2),
        "flagged_area_pct": round(defect_area_pct, 3),
        "image_size": [W, H],
        "explanation": (
            f"{len(regions)} anomalous region(s) found: {', '.join(suggested)}. Largest deviation "
            f"{worst:.1f} robust units. Baseline heuristic - inspector confirmation required."
            if regions else
            "No region deviated strongly from this fabric's own texture and colour. A pass from an "
            "unvalidated baseline is not proof of quality - inspector confirmation required."),
    }


def _iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union else 0.0


def synthetic_fabric(width=640, height=480, seed=0, defect: str | None = None,
                     colour=(150, 120, 60)) -> np.ndarray:
    """Synthetic plain-weave texture for demos and tests (clearly labelled synthetic in the UI)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    weave = 18 * np.sin(xx * 2 * np.pi / 6) * np.sin(yy * 2 * np.pi / 6)
    noise = rng.normal(0, 4, (height, width)).astype(np.float32)
    base = np.dstack([np.full((height, width), c, np.float32) for c in colour])
    img = base + (weave + noise)[..., None]
    if defect == "hole":
        cv2.circle(img, (int(width * .62), int(height * .4)), 14, (25, 25, 25), -1)
    elif defect == "stain":
        overlay = img.copy()
        cv2.ellipse(overlay, (int(width * .3), int(height * .6)), (48, 30), 20, 0, 360, (60, 95, 170), -1)
        img = cv2.addWeighted(overlay, 0.55, img, 0.45, 0)
    elif defect == "weave":
        y0 = int(height * .5)
        img[y0:y0 + 10, :, :] = base[y0:y0 + 10] + rng.normal(0, 1, (10, width, 1)).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)
