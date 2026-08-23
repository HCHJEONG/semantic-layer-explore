package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr                  string
	SSHAddr                   string
	KafkaBrokers              []string
	TelemetryTopic            string
	GraphRebuildTopic         string
	DatabaseURL               string
	Neo4jHTTPURL              string
	Neo4jUser                 string
	Neo4jPassword             string
	MQTTURL                   string
	MQTTTopic                 string
	MQTTCommandTopic          string
	MQTTResultTopic           string
	CommandResultTopic        string
	CommandAckTimeout         time.Duration
	CommandMaxPublishAttempts int
	CommandRetryInitial       time.Duration
	CommandRetryMax           time.Duration
}

func FromEnv() Config {
	return Config{
		HTTPAddr:                  env("API_HTTP_ADDR", ":8080"),
		SSHAddr:                   env("API_SSH_ADDR", ":2222"),
		KafkaBrokers:              csv(env("KAFKA_BROKERS", "kafka:9092")),
		TelemetryTopic:            env("KAFKA_TELEMETRY_TOPIC", "telemetry.raw"),
		GraphRebuildTopic:         env("KAFKA_GRAPH_REBUILD_TOPIC", "semantic.graph.rebuild"),
		DatabaseURL:               env("DATABASE_URL", "postgres://physicalai:physicalai@postgres:5432/physicalai"),
		Neo4jHTTPURL:              env("NEO4J_HTTP_URL", "http://neo4j:7474/db/neo4j/tx/commit"),
		Neo4jUser:                 env("NEO4J_USER", "neo4j"),
		Neo4jPassword:             env("NEO4J_PASSWORD", "physicalai"),
		MQTTURL:                   env("MQTT_URL", "tcp://mosquitto:1883"),
		MQTTTopic:                 env("MQTT_TELEMETRY_TOPIC", "devices/+/telemetry"),
		MQTTCommandTopic:          env("MQTT_COMMAND_TOPIC_TEMPLATE", "devices/%s/commands"),
		MQTTResultTopic:           env("MQTT_COMMAND_RESULT_TOPIC", "devices/+/command-results"),
		CommandResultTopic:        env("KAFKA_COMMAND_RESULT_TOPIC", "command.result"),
		CommandAckTimeout:         time.Duration(envInt("COMMAND_ACK_TIMEOUT_SECONDS", 10)) * time.Second,
		CommandMaxPublishAttempts: envInt("MQTT_COMMAND_MAX_PUBLISH_ATTEMPTS", 3),
		CommandRetryInitial:       time.Duration(envInt("MQTT_COMMAND_RETRY_INITIAL_MS", 500)) * time.Millisecond,
		CommandRetryMax:           time.Duration(envInt("MQTT_COMMAND_RETRY_MAX_MS", 5000)) * time.Millisecond,
	}
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value < 1 {
		return fallback
	}
	return value
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
