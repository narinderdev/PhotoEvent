# AI Masking Service

Python sidecar service for photo masking.

## Run

1. `python3 -m venv .venv`
2. `source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. `uvicorn app:app --reload --host 127.0.0.1 --port 8000`

## Contract

- `GET /health` returns service availability for the Node backend
- `POST /mask` accepts one `photo` file and returns mask metadata

The current implementation is a starter heuristic built with Pillow so the Electron + Node + Python split is in place. Replace it with your production masking model when ready.
