# The worker image: the plasto_worker kit, its locked dependencies and the
# workers in this folder. It runs worker.py unless you give it another command:
#   docker run ... ghcr.io/selfhostit/flowy-worker python my_worker.py

# Base images and uv are pinned by digest; Dependabot moves the digests weekly.
# uv only runs on the build machine; its image has no armv7 build, so it is taken
# for the build platform instead of each target one.
FROM --platform=$BUILDPLATFORM ghcr.io/astral-sh/uv:0.13.10@sha256:a3ea1357342c1a4bf9a0c53a3deb1b55379aefa037338d8113d5771efa01774f AS uv
# --- build: resolve the locked dependencies and build the kit's wheel ---
FROM --platform=$BUILDPLATFORM python:3.15-slim@sha256:63bb298d2b7b88f176f51b5189f54ce6535c997682ea70885d2132f5d473a8a5 AS build
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /src
COPY pyproject.toml uv.lock README.md ./
COPY src/ src/
RUN uv export --locked --no-dev --no-emit-project -o requirements.txt \
    && uv build --wheel -o dist

# --- runtime ---
FROM python:3.15-slim@sha256:63bb298d2b7b88f176f51b5189f54ce6535c997682ea70885d2132f5d473a8a5 AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
# Take Debian's security fixes now rather than waiting for the base image to be rebuilt.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/requirements.txt /src/dist/ /tmp/build/
# requirements.txt carries a hash for every package, so pip refuses anything else.
RUN pip install --no-cache-dir --require-hashes -r /tmp/build/requirements.txt \
    && pip install --no-cache-dir --no-deps /tmp/build/*.whl \
    && rm -rf /tmp/build \
    && useradd -u 1000 -m app
WORKDIR /app
COPY --chown=app:app *.py ./
USER app
CMD ["python", "worker.py"]
