package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"semantic-layer-explore/api/internal/config"
	"semantic-layer-explore/api/internal/graph"
	"semantic-layer-explore/api/internal/kafka"
	"semantic-layer-explore/api/internal/persistence"
)

type Router struct {
	cfg      config.Config
	producer *kafka.Producer
	store    *persistence.Store
	logger   *slog.Logger
	graph    *graph.Client
}

func NewRouter(cfg config.Config, producer *kafka.Producer, store *persistence.Store, logger *slog.Logger) http.Handler {
	router := &Router{cfg: cfg, producer: producer, store: store, logger: logger, graph: graph.NewClient(cfg.Neo4jHTTPURL, cfg.Neo4jUser, cfg.Neo4jPassword)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", router.health)
	mux.HandleFunc("GET /ready", router.ready)
	mux.HandleFunc("POST /telemetry", router.telemetry)
	mux.HandleFunc("GET /operations/summary", router.operationsSummary)
	mux.HandleFunc("GET /operations/agent-results", router.agentResults)
	mux.HandleFunc("GET /graph/projection/status", router.graphProjectionStatus)
	mux.HandleFunc("POST /graph/projection/rebuild", router.graphProjectionRebuild)
	mux.HandleFunc("GET /graph/ontology", router.graphOntology)
	mux.HandleFunc("GET /semantic/classes", router.semanticClasses)
	mux.HandleFunc("POST /semantic/classes", router.semanticClasses)
	mux.HandleFunc("GET /semantic/properties", router.semanticProperties)
	mux.HandleFunc("POST /semantic/properties", router.semanticProperties)
	mux.HandleFunc("GET /semantic/individuals", router.semanticIndividuals)
	mux.HandleFunc("POST /semantic/individuals", router.semanticIndividuals)
	mux.HandleFunc("GET /semantic/relations", router.semanticRelations)
	mux.HandleFunc("POST /semantic/relations", router.semanticRelations)
	mux.HandleFunc("GET /semantic/ontology", router.semanticOntology)
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

func (r *Router) agentResults(w http.ResponseWriter, req *http.Request) {
	limit := 10
	if value := req.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 50 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit must be between 1 and 50"})
			return
		}
		limit = parsed
	}

	results, err := r.store.ListAgentResults(req.Context(), limit)
	if err != nil {
		r.logger.Error("agent results failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "agent results unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
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

func (r *Router) graphProjectionStatus(w http.ResponseWriter, req *http.Request) {
	status, err := r.store.GraphProjectionStatus(req.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "graph projection status unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (r *Router) graphProjectionRebuild(w http.ResponseWriter, req *http.Request) {
	event, err := newGraphRebuild()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create rebuild id"})
		return
	}
	if err := r.store.EnqueueOutbox(req.Context(), r.rebuildOutbox(event)); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "graph rebuild enqueue failed"})
		return
	}
	writeJSON(w, http.StatusAccepted, event)
}

func newGraphRebuild() (kafka.GraphRebuild, error) {
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		return kafka.GraphRebuild{}, err
	}
	return kafka.GraphRebuild{SchemaVersion: "graph-rebuild.v1", RebuildID: "rebuild-" + hex.EncodeToString(random), RequestedAt: time.Now().UTC().Format(time.RFC3339), Scope: "ontology"}, nil
}

func (r *Router) rebuildOutbox(event kafka.GraphRebuild) persistence.RebuildOutbox {
	return persistence.RebuildOutbox{EventID: event.RebuildID, Topic: r.cfg.GraphRebuildTopic, Key: event.RebuildID, Payload: event}
}

func (r *Router) graphOntology(w http.ResponseWriter, req *http.Request) {
	status, err := r.store.GraphProjectionStatus(req.Context())
	if err != nil || status.Status != "ready" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "graph projection is not ready"})
		return
	}
	ontology, err := r.graph.Ontology(req.Context())
	if err != nil {
		r.logger.Error("graph ontology query failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "graph ontology unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, ontology)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
