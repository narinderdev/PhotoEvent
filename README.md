# PhotoFlow AI Workspace

This workspace is now organized around the stack you specified:

- `desktop-app`: Electron + React desktop client
- `backend`: Node.js API for compression, parallel upload, albums, shares, and Python proxying
- `ai-service`: Python masking sidecar

## Feature set

- Desktop compression and parallel upload
- Facial recognition clustering in the desktop renderer
- AI album suggestions from the Node backend
- QR-based photo sharing

## Local run order

1. Start the Python service in [ai-service/README.md](/Users/apnitormacmini3/Desktop/Tauri App/photo-app/ai-service/README.md)
2. Start the Node API with `npm run dev` inside `backend`
3. Start the Electron desktop app with `npm run dev` inside `desktop-app`
# PhotoEvent


Backend .env
CORS_ORIGINS=https://dev.glowante.com,http://localhost:5173
SPACES_REGION=blr1
SPACES_NAME=glowante
SPACES_ENDPOINT=https://blr1.digitaloceanspaces.com
SPACES_KEY=DO00LA33FBFD4AA76NV8
SPACES_SECRET=HkJMycnO9mAjZ9lISTY6pZac73BUKRTy69s1EiD8/QY
SPACES_CDN_URL=https://glowante.blr1.cdn.digitaloceanspaces.com
DB_SSL=true
SPACES_UPLOAD_PREFIX=photo_event/uploads
PORT=3000