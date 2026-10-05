# Backend image with Poppler (pdftotext) for reading PDF text with its layout.
# Render: create the service with Runtime = Docker and Root Directory = backend.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/server.js"]
