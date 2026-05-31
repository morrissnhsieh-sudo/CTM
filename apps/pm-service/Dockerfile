# Multi-stage Go build (build context = repo root)
FROM golang:1.23-alpine AS builder
WORKDIR /app
# Allow automatic toolchain download for indirect deps that need newer Go
ENV GOTOOLCHAIN=auto
RUN apk --no-cache add git
COPY apps/pm-service/go.mod apps/pm-service/go.sum ./
RUN go mod download
COPY apps/pm-service/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o pm-service ./cmd/pm-service

FROM alpine:3.20 AS production
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/pm-service .

EXPOSE 50051 8080
CMD ["./pm-service"]
