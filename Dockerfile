FROM node:22-bookworm-slim

# better-sqlite3 ships prebuilt binaries for this platform; the build tools are
# only a fallback so `npm ci` cannot fail on a host with a different libc.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/var/data
EXPOSE 3000

CMD ["node", "server.js"]
