FROM golang:1.21-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o headfwd-sidecar .

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /build/headfwd-sidecar /usr/local/bin/
ENTRYPOINT ["headfwd-sidecar"]
CMD ["--tunnel", "${TUNNEL_URL}", "--headscale", "${HEADSCALE_URL}"]

