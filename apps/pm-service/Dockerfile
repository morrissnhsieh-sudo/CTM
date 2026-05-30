# Multi-stage Go build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o pm-service ./cmd/pm-service

FROM alpine:3.20 AS production
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/pm-service .

EXPOSE 50051 8080
CMD ["./pm-service"]
