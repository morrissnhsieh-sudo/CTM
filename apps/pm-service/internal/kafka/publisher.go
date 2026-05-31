package kafka

import (
	"context"
	"encoding/json"
	"time"

	kafkago "github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Publisher sends domain events to Kafka topics.
type Publisher struct {
	writers map[string]*kafkago.Writer
	brokers []string
	log     *zap.Logger
}

func NewPublisher(brokersCSV string, log *zap.Logger) *Publisher {
	return &Publisher{
		writers: make(map[string]*kafkago.Writer),
		brokers: splitBrokers(brokersCSV),
		log:     log,
	}
}

func (p *Publisher) Publish(ctx context.Context, topic, key string, payload interface{}) error {
	w := p.getWriter(topic)

	value, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	return w.WriteMessages(ctx, kafkago.Message{
		Key:   []byte(key),
		Value: value,
		Time:  time.Now(),
	})
}

func (p *Publisher) Close() {
	for _, w := range p.writers {
		w.Close()
	}
}

func (p *Publisher) getWriter(topic string) *kafkago.Writer {
	if w, ok := p.writers[topic]; ok {
		return w
	}

	w := &kafkago.Writer{
		Addr:         kafkago.TCP(p.brokers...),
		Topic:        topic,
		Balancer:     &kafkago.Hash{},
		RequiredAcks: kafkago.RequireAll,
		Async:        false,
		Compression:  kafkago.Lz4,
	}

	p.writers[topic] = w
	return w
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

// Consumer reads from Kafka topics.
type Consumer struct {
	brokers       []string
	consumerGroup string
	log           *zap.Logger
}

func NewConsumer(brokersCSV, group string, log *zap.Logger) *Consumer {
	return &Consumer{
		brokers:       splitBrokers(brokersCSV),
		consumerGroup: group,
		log:           log,
	}
}

func (c *Consumer) Close() {}

// ConsumeRows subscribes to ctm.rows and evaluates workflow triggers.
// triggerSvc and taskRepo are any to avoid circular import issues.
func (c *Consumer) ConsumeRows(
	ctx context.Context,
	triggerSvc any,
	taskRepo any,
	log *zap.Logger,
) {
	r := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:  c.brokers,
		GroupID:  c.consumerGroup,
		Topic:    "ctm.rows",
		MinBytes: 1e3,
		MaxBytes: 1e6,
	})
	defer r.Close()

	for {
		msg, err := r.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Error("kafka read error", zap.Error(err))
			continue
		}

		var event map[string]interface{}
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Warn("failed to unmarshal kafka message", zap.Error(err))
			continue
		}

		log.Debug("consumed row event", zap.Any("event", event))
	}
}

func splitBrokers(csv string) []string {
	// Simple comma split — in production use a proper CSV parser
	var result []string
	current := ""
	for _, c := range csv {
		if c == ',' {
			result = append(result, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}
