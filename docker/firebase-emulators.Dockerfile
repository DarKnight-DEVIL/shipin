# Firestore + Auth emulators for the local stack in ../docker-compose.yml.
#
# Why this image exists at all: the emulators are Java processes that
# firebase-tools downloads and launches, so the CLI needs both a JVM and a Node
# runtime. Pinned to the same firebase-tools version the repository's npm
# scripts use (`npm run emulators`, `scripts/e2e-local.mjs`), so the local stack
# and the E2E run cannot disagree about emulator behaviour.
FROM node:24-bookworm-slim

# The Firestore emulator is a Java process; Debian's headless JRE is enough.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global firebase-tools@15.36.0

# The CLI runs as `node`, and the emulators write their debug log into the
# working directory, so /workspace has to belong to that user: compose mounts
# firebase.json, firestore.rules and firestore.indexes.json into it read-only.
#
# The cache directory is created here with the right owner on purpose: a named
# volume mounted over a path that exists in the image inherits that directory's
# ownership, but over a missing path it is created as root and `node` could not
# write the downloaded jars into it.
RUN mkdir -p /workspace /home/node/.cache/firebase \
  && chown -R node:node /workspace /home/node/.cache

USER node

# Docker does not rewrite HOME when it switches user; firebase-tools resolves
# its cache and configstore from it.
ENV HOME=/home/node

WORKDIR /workspace

# firebase.json declares auth:9099 and firestore:8080; compose publishes both.
EXPOSE 8080 9099

# The emulator jars are fetched on first start, not at build time, so the first
# `docker compose up` needs network access (~100 MB). Compose starts the app
# only once this container reports healthy, which covers that download.
CMD ["firebase", "--config", "/workspace/firebase.json", "emulators:start", "--only", "firestore,auth", "--project", "demo-shipin"]
