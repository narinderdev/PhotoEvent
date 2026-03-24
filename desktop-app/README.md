# PhotoFlow Desktop

Electron desktop shell with a React + Vite renderer for:

- compression and parallel upload orchestration
- local facial recognition clustering
- AI album generation
- QR-based share handoff

## Run

1. Install desktop dependencies with `npm install`
2. Start the backend in `../backend`
3. Run `npm run dev`

The renderer expects `VITE_API_BASE_URL` and `VITE_FACE_MODEL_URL`. See [.env.example](/Users/apnitormacmini3/Desktop/Tauri App/photo-app/desktop-app/.env.example).
