# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install dependencies (cached layer)
COPY go.mod go.sum ./
RUN go mod download

# Build binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o rnv-api .

# ── Production stage ──────────────────────────────────────────────────────────
FROM alpine:3.21

# ca-certificates for HTTPS outgoing requests, tzdata for timezone
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/rnv-api .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["./rnv-api"]
