"""Deterministic descriptors of a reproduction, not of physical paint chemistry."""
from __future__ import annotations

import hashlib
import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms, ImageFilter, ImageOps


def srgb_to_linear(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def rgb_to_lab(rgb):
    """sRGB [0,1] to CIELAB, D65/2-degree white, without chromatic adaptation."""
    matrix = np.array([[0.4124564, 0.3575761, 0.1804375],
                       [0.2126729, 0.7151522, 0.0721750],
                       [0.0193339, 0.1191920, 0.9503041]])
    xyz = srgb_to_linear(rgb) @ matrix.T / np.array([0.95047, 1.0, 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack((116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])), axis=-1)


def load_image(path: Path, max_side=512, crop=None):
    """Orient, color-manage and downsample; retain original-coordinate provenance."""
    raw = path.read_bytes()
    with Image.open(io.BytesIO(raw)) as opened:
        if getattr(opened, "n_frames", 1) != 1:
            raise ValueError("Provide a single still image rather than an animated or multi-frame file.")
        encoded_size = list(opened.size)
        orientation = int(opened.getexif().get(274, 1))
        image = ImageOps.exif_transpose(opened)
        oriented_size = list(image.size)
        if min(image.size) < 3:
            raise ValueError("Image dimensions must both be at least 3 pixels.")
        profile = opened.info.get("icc_profile")
        original_mode = image.mode
        if "A" in image.getbands() or image.mode == "P" and "transparency" in image.info:
            if image.convert("RGBA").getchannel("A").getextrema() != (255, 255):
                raise ValueError("Transparent input needs an explicitly chosen background before analysis.")
        if profile:
            try:
                source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
                image = ImageCms.profileToProfile(
                    image, source, ImageCms.createProfile("sRGB"), outputMode="RGB")
                color_note = "Embedded ICC profile converted to sRGB with Pillow/LittleCMS; perceptual rendering intent."
            except Exception as exc:
                raise ValueError("Embedded ICC profile could not be interpreted; correct the profile before analysis.") from exc
        elif image.mode == "CMYK":
            raise ValueError("Unprofiled CMYK input needs an explicit source ICC profile.")
        elif image.mode not in {"RGB", "RGBA", "L", "LA", "P", "1"}:
            raise ValueError("High-bit-depth or scientific input needs an explicit display transform before RGB analysis.")
        else:
            color_note = "No embedded ICC profile; sRGB appearance is assumed, not verified."
        if "A" in image.getbands() or image.mode == "P" and "transparency" in image.info:
            rgba = image.convert("RGBA")
            if rgba.getchannel("A").getextrema() != (255, 255):
                raise ValueError("Transparent input needs an explicitly chosen background before analysis.")
        image = image.convert("RGB")
        crop_box = [0, 0, oriented_size[0], oriented_size[1]]
        if crop is not None:
            if len(crop) != 4 or not all(np.isfinite(v) for v in crop):
                raise ValueError("Crop must contain four finite normalized bounds.")
            x0, y0, x1, y1 = crop
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                raise ValueError("Crop bounds must be ordered inside [0,1].")
            crop_box = [round(x0 * image.width), round(y0 * image.height),
                        round(x1 * image.width), round(y1 * image.height)]
            if crop_box[2] - crop_box[0] < 3 or crop_box[3] - crop_box[1] < 3:
                raise ValueError("Crop must retain at least 3 pixels in both dimensions.")
            image = image.crop(crop_box)
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        if min(image.size) < 3:
            raise ValueError("Image aspect ratio requires a larger analysis scale to preserve at least 3 pixels per dimension.")
        crop_normalized = [crop_box[0] / oriented_size[0], crop_box[1] / oriented_size[1],
                           crop_box[2] / oriented_size[0], crop_box[3] / oriented_size[1]]
        provenance = {
            "input_sha256": hashlib.sha256(raw).hexdigest(),
            "encoded_size": encoded_size, "exif_orientation": orientation,
            "oriented_size": oriented_size, "analysis_size": list(image.size),
            "original_mode": original_mode,
            "icc_profile_sha256": hashlib.sha256(profile).hexdigest() if profile else None,
            "color_note": color_note,
            "analysis_bounds_in_source": crop_normalized,
            "analysis_bounds_source_pixels": crop_box,
            "coordinate_mapping": "Region boxes refer to the full EXIF-oriented source. Feature centroids refer to the analysis frame: source_x=x0+frame_x*(x1-x0), and similarly for y, using analysis_bounds_in_source. Encoded-file coordinates additionally require the recorded EXIF transform.",
            "processing": "EXIF orientation; ICC to sRGB or explicit sRGB assumption; optional explicit crop; aspect-preserving Lanczos downsample; no generative enhancement."
        }
    return image, provenance


def palette_features(rgb, lab, colors=6, seed=0):
    flat = lab.reshape(-1, 3)
    rng = np.random.default_rng(seed)
    sample = flat[rng.choice(len(flat), min(4096, len(flat)), replace=False)]
    unique = np.unique(np.round(sample, 5), axis=0)
    k = min(colors, len(unique))
    centers = [sample[int(rng.integers(len(sample)))]]
    for _ in range(1, k):
        distances = np.min(np.sum((sample[:, None] - np.array(centers)[None]) ** 2, axis=2), axis=1)
        if distances.sum() <= 1e-12:
            break
        centers.append(sample[rng.choice(len(sample), p=distances / distances.sum())])
    centers = np.array(centers)
    for _ in range(24):
        labels = np.argmin(np.sum((sample[:, None] - centers[None]) ** 2, axis=2), axis=1)
        updated = np.array([sample[labels == i].mean(axis=0) if np.any(labels == i) else c
                            for i, c in enumerate(centers)])
        if np.max(np.abs(updated - centers)) < 0.01:
            centers = updated
            break
        centers = updated
    labels = np.concatenate([
        np.argmin(np.sum((flat[i:i + 20000, None] - centers[None]) ** 2, axis=2), axis=1)
        for i in range(0, len(flat), 20000)
    ]).reshape(lab.shape[:2])
    order = sorted(range(len(centers)), key=lambda i: -int((labels == i).sum()))
    remap = np.zeros(len(centers), dtype=int)
    for i, old in enumerate(order):
        remap[old] = i
    labels = remap[labels]
    h, w = labels.shape
    palette = []
    for i in range(len(centers)):
        mask = labels == i
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            continue
        mean_rgb = np.mean(rgb[mask], axis=0)
        mean_lab = np.mean(lab[mask], axis=0)
        palette.append({
            "id": f"palette-{i + 1}", "share": float(mask.mean()),
            "rgb": [int(x) for x in np.rint(mean_rgb * 255)],
            "hex": "#" + "".join(f"{int(x):02x}" for x in np.rint(mean_rgb * 255)),
            "lab": mean_lab.tolist(),
            "centroid": [float(np.mean((xs + 0.5) / w)), float(np.mean((ys + 0.5) / h))],
            "bbox": [float(xs.min() / w), float(ys.min() / h),
                     float((xs.max() + 1) / w), float((ys.max() + 1) / h)],
            "region_note": "A potentially disconnected pixel family; centroid is not an object center or a focal point."
        })
    return palette, labels


def edge_features(image):
    # Blur scale is part of the measurement definition, not reconstructed brushwork.
    blurred = np.asarray(image.filter(ImageFilter.GaussianBlur(radius=1)), dtype=float) / 255
    luminance = srgb_to_linear(blurred) @ np.array([0.2126, 0.7152, 0.0722])
    gy, gx = np.gradient(luminance)
    magnitude = np.hypot(gx, gy)
    threshold = max(0.02, float(np.quantile(magnitude, 0.85)))
    strong = magnitude >= threshold
    strong[[0, -1], :] = False
    strong[:, [0, -1]] = False
    tangent = (np.arctan2(gy, gx) + np.pi / 2) % np.pi
    indices = np.floor((tangent + np.pi / 16) / (np.pi / 8)).astype(int) % 8
    histogram = np.bincount(indices[strong], weights=magnitude[strong], minlength=8)
    histogram = histogram / histogram.sum() if histogram.sum() > 0 else np.zeros(8)
    return {
        "method": "Gradient tangents after Gaussian radius=1 analysis pixel; 8 circular bins over 180 degrees, weighted by gradient magnitude.",
        "threshold": threshold, "strong_edge_density": float(strong.mean()),
        "orientation_degrees": [i * 22.5 for i in range(8)],
        "orientation_shares": histogram.tolist(),
        "dominant_tangent_degrees": float(np.argmax(histogram) * 22.5) if histogram.sum() else None,
        "dominant_bin_share": float(histogram.max()),
        "angle_convention": "Image coordinates: x right, y down; 0=horizontal, 90=vertical; tangents are undirected modulo 180 degrees."
    }, strong, magnitude, tangent


def measure(image):
    rgb = np.asarray(image, dtype=np.float64) / 255
    lab = rgb_to_lab(rgb)
    palette, labels = palette_features(rgb, lab)
    edge, strong, magnitude, tangent = edge_features(image)
    h, w = strong.shape
    cells = []
    for row in range(3):
        for col in range(3):
            x0, x1 = int(col * w / 3), int((col + 1) * w / 3)
            y0, y1 = int(row * h / 3), int((row + 1) * h / 3)
            cells.append({
                "id": f"cell-{row + 1}-{col + 1}",
                "bbox": [x0 / w, y0 / h, x1 / w, y1 / h],
                "mean_lightness": float(lab[y0:y1, x0:x1, 0].mean()),
                "lightness_std": float(lab[y0:y1, x0:x1, 0].std()),
                "strong_edge_density": float(strong[y0:y1, x0:x1].mean())
            })
    measurements = {
        "version": "0.1", "width": w, "height": h,
        "palette_method": "Deterministic sampled CIELAB k-means; k<=6, sample<=4096, seed=0, max 24 iterations; full-image assignments; family proportions on analysis pixels.",
        "palette": palette,
        "lightness": {"definition": "CIELAB L*, D65/2-degree, sRGB assumption or profile conversion",
                      "quantiles_05_50_95": np.quantile(lab[..., 0], [0.05, 0.5, 0.95]).tolist(),
                      "mean": float(lab[..., 0].mean()),
                      "std": float(lab[..., 0].std())},
        "edges": edge, "cells": cells,
        "reflection_residual": {
            "left_right_Lstar_MAE": float(np.abs(lab[..., 0] - lab[:, ::-1, 0]).mean()),
            "top_bottom_Lstar_MAE": float(np.abs(lab[..., 0] - lab[::-1, :, 0]).mean()),
            "note": "Pixel reflection residual is not visual balance or a quality judgment."
        }
    }
    arrays = {"rgb": rgb, "lab": lab, "labels": labels, "strong_edges": strong,
              "magnitude": magnitude, "tangent": tangent}
    return measurements, arrays
