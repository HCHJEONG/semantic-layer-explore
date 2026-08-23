package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/kafka"
	"semantic-layer-explore/api/internal/persistence"
)

type Router struct {
	cfg      config.Config
	producer *kafka.Producer
	store    *persistence.Store
	logger   *slog.Logger
}

func NewRouter(cfg config.Config, producer *kafka.Producer, store *persistence.Store, logger *slog.Logger) http.Handler {
	router := &Router{cfg: cfg, producer: producer, store: store, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", router.health)
	mux.HandleFunc("GET /ready", router.ready)
	mux.HandleFunc("POST /telemetry", router.telemetry)
	mux.HandleFunc("GET /operations/summary", router.operationsSummary)
	mux.HandleFunc("GET /graph/projection/status", router.graphProjectionStatus)
	return mux
}

func (r *Router) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "go-gateway"})
}

func (r *Router) operationsSummary(w http.ResponseWriter, req *http.Request) {
	summary, err := r.store.OperationsSummary(req.Context())
	if err != nil {
		r.logger.Error("operations summary failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "operations summary unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func (r *Router) ready(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ready",
		"kafka":  r.cfg.KafkaBrokers,
		"topic":  r.cfg.TelemetryTopic,
	})
}

func (r *Router) telemetry(w http.ResponseWriter, req *http.Request) {
	defer req.Body.Close()
	var event kafka.TelemetryEvent
	if err := json.NewDecoder(req.Body).Decode(&event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := event.Validate(); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	if err := r.producer.PublishTelemetry(req.Context(), event); err != nil {
		r.logger.Error("telemetry publish failed", "eventId", event.EventID, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "kafka publish failed"})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued", "eventId": event.EventID})
}

func (r *Router) graphProjectionStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "not_configured",
		"detail": "Neo4j projection endpoint skeleton is present; graph profile wiring comes later.",
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
