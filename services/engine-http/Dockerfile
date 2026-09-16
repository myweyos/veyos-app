# Weyos engine sidecar. Build context is the REPO ROOT: the sidecar path-depends on the engine,
# and the engine reads config/rules and the food-tag vocabulary relative to the repo layout.
#   docker build -f services/engine-http/Dockerfile -t weyos-engine .
#
# The sidecar has NO authentication. It is never given a public address: the Fly config for it
# has no [http_service], so only the API reaches it over the private network (ADR 0004).

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY config/rules ./config/rules
COPY packages/shared-schema/schemas ./packages/shared-schema/schemas
COPY services/engine ./services/engine
COPY services/engine-http ./services/engine-http
# Editable installs, deliberately: the engine locates config/rules and the food-tag vocabulary
# relative to its own source (config.py's REPO_ROOT). Installed into site-packages that walk
# lands nowhere, the rulebook isn't found, and the vocabulary check silently turns off
# (risk file R11). Keeping the source at /app/services/engine keeps REPO_ROOT = /app.
RUN pip install --no-cache-dir -e ./services/engine -e ./services/engine-http \
 && useradd --create-home --uid 1000 weyos
USER weyos
ENV WEYOS_ENGINE_HOST=0.0.0.0 WEYOS_ENGINE_PORT=8000 \
    WEYOS_RULEBOOK_PATH=/app/config/rules/rules.v1.yaml \
    WEYOS_FOOD_TAGS_PATH=/app/packages/shared-schema/schemas/food-tags.json
EXPOSE 8000
CMD ["python", "-m", "weyos_engine_http"]
