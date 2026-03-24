from __future__ import annotations

import io
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

app = FastAPI(title="PhotoFlow AI Masking Service", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "python-pillow-masker",
        "note": "Starter masking service. Replace the heuristic with your production face-masking model.",
    }


@app.post("/mask")
async def mask_photo(photo: UploadFile = File(...)) -> dict[str, Any]:
    payload = await photo.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty upload.")

    try:
        image = Image.open(io.BytesIO(payload))
        image.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Unsupported or corrupt image.")

    width, height = image.size
    ellipse_width = max(int(width * 0.42), 1)
    ellipse_height = max(int(height * 0.58), 1)
    left = max((width - ellipse_width) // 2, 0)
    top = max((height - ellipse_height) // 2, 0)

    return {
        "status": "ok",
        "engine": "python-pillow-masker",
        "fileName": photo.filename,
        "contentType": photo.content_type,
        "image": {
            "width": width,
            "height": height,
        },
        "mask": {
            "kind": "ellipse",
            "strategy": "center-weighted-portrait-heuristic",
            "bounds": {
                "x": left,
                "y": top,
                "width": ellipse_width,
                "height": ellipse_height,
            },
        },
    }
