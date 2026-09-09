# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY scripts/ ../scripts/
RUN npm run build

# cargo-chef separates dependency compilation from source compilation.
# Source edits that don't change Cargo.toml/Cargo.lock skip the expensive
# dependency rebuild entirely — the cached chef layer is reused.
ARG RUST_IMAGE=rust:1.98.0-alpine
ARG CARGO_CHEF_VERSION=0.1.77

FROM ${RUST_IMAGE} AS chef
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
ARG CARGO_CHEF_VERSION
RUN --mount=type=cache,id=control-plane-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=control-plane-cargo-git,target=/usr/local/cargo/git/db,sharing=locked \
    cargo install cargo-chef --locked --profile dev --version "${CARGO_CHEF_VERSION}"
WORKDIR /src

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /src/recipe.json recipe.json
RUN --mount=type=cache,id=control-plane-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=control-plane-cargo-git,target=/usr/local/cargo/git/db,sharing=locked \
    --mount=type=cache,id=control-plane-target,target=/src/target,sharing=locked \
    cargo chef cook --release --locked --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY migrations/ ./migrations/
RUN --mount=type=cache,id=control-plane-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=control-plane-cargo-git,target=/usr/local/cargo/git/db,sharing=locked \
    --mount=type=cache,id=control-plane-target,target=/src/target,sharing=locked \
    cargo build --release --locked \
    && install --directory /out \
    && install --mode 0755 target/release/crowdrelay-control-plane-api /out/control-plane

FROM alpine:3.22
ARG VCS_REF=unknown
LABEL org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.source=https://github.com/CrowdRelay/crowdrelay-control-plane \
      org.opencontainers.image.title=crowdrelay-control-plane
RUN addgroup -S controlplane && adduser -S -G controlplane controlplane
WORKDIR /app
COPY --from=builder /out/control-plane /usr/local/bin/control-plane
COPY --from=web /src/frontend/dist /app/frontend/dist
USER controlplane
ENV CONTROL_PLANE_BIND=0.0.0.0:8090 CONTROL_PLANE_FRONTEND_DIST=/app/frontend/dist
EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/control-plane"]
