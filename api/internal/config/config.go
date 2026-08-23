package config

import (
	"os"
	"strings"
)

type Config struct {
	HTTPAddr       string
	SSHAddr        string
	KafkaBrokers   []string
	TelemetryTopic string
	DatabaseURL    string
	MQTTURL        string
	MQTTTopic      string
}

func FromEnv() Config {
	return Config{
		HTTPAddr:       env("API_HTTP_ADDR", ":8080"),
		SSHAddr:        env("API_SSH_ADDR", ":2222"),
		KafkaBrokers:   csv(env("KAFKA_BROKERS", "kafka:9092")),
		TelemetryTopic: env("KAFKA_TELEMETRY_TOPIC", "telemetry.raw"),
		DatabaseURL:    env("DATABASE_URL", "postgres://physicalai:physicalai@postgres:5432/physicalai"),
		MQTTURL:        env("MQTT_URL", "tcp://mosquitto:1883"),
		MQTTTopic:      env("MQTT_TELEMETRY_TOPIC", "devices/+/telemetry"),
	}
}

func env(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func csv(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
