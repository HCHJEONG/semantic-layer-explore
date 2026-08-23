FROM rust:1.88-bookworm AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ libcurl4-openssl-dev pkg-config && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates zlib1g && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/semantic-graph-worker /app/semantic-graph-worker
CMD ["/app/semantic-graph-worker"]
