package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"semantic-layer-explore/api/internal/persistence"
)

func (r *Router) workspaceEvents(w http.ResponseWriter, req *http.Request) {
	limit := 50
	if value := req.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid limit"})
			return
		}
		limit = parsed
	}
	items, err := r.store.ListWorkspaceEvents(req.Context(), limit)
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "events unavailable"})
		return
	}
	writeJSON(w, 200, items)
}

func (r *Router) workspaceEventStream(w http.ResponseWriter, req *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, 500, map[string]string{"error": "stream unavailable"})
		return
	}
	cursor := int64(0)
	value := req.URL.Query().Get("after")
	if value == "" {
		value = req.Header.Get("Last-Event-ID")
	}
	if value != "" {
		cursor, _ = strconv.ParseInt(value, 10, 64)
	} else if latest, err := r.store.ListWorkspaceEvents(req.Context(), 1); err == nil && len(latest) > 0 {
		cursor = latest[0].ID
	}
	w.Header().Set("content-type", "text/event-stream; charset=utf-8")
	w.Header().Set("cache-control", "no-cache, no-transform")
	w.Header().Set("connection", "keep-alive")
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-req.Context().Done():
			return
		case <-ticker.C:
			items, err := r.store.ListWorkspaceEventsAfter(req.Context(), cursor, 50)
			if err != nil {
				return
			}
			for _, event := range items {
				body, _ := json.Marshal(event)
				fmt.Fprintf(w, "id: %d\nevent: workspace-event\ndata: %s\n\n", event.ID, body)
				cursor = event.ID
			}
			if len(items) == 0 {
				fmt.Fprint(w, ": heartbeat\n\n")
			}
			flusher.Flush()
		}
	}
}

func object(value any) map[string]any {
	if item, ok := value.(map[string]any); ok {
		return item
	}
	return map[string]any{}
}
func textValue(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(value)
}
func evidence(id, label, support, detail string, event *persistence.WorkspaceEvent) map[string]any {
	item := map[string]any{"id": id, "label": label, "support": support, "detail": detail}
	if event != nil {
		item["eventId"] = event.EventID
		item["eventType"] = event.Type
	}
	return item
}

func (r *Router) causalTrace(w http.ResponseWriter, req *http.Request) {
	eventID := req.PathValue("eventId")
	selected, err := r.store.GetWorkspaceEvent(req.Context(), eventID)
	if err == pgx.ErrNoRows {
		writeJSON(w, 400, map[string]string{"error": "Unknown event: " + eventID})
		return
	}
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "causal trace unavailable"})
		return
	}
	if selected.Type != "device.command.succeeded" && selected.Type != "device.command.failed" {
		writeJSON(w, 200, map[string]any{"eventId": eventID, "explainable": false, "completeness": "insufficient", "title": "This event cannot be explained", "summary": "The selected event is not explainable.", "selectedEvent": selected, "missing": []string{"explainable action event"}, "evidence": []any{}, "causalSteps": []any{}})
		return
	}
	command := object(selected.Payload["command"])
	result := object(selected.Payload["result"])
	causation := object(command["causation"])
	var ruleEvent *persistence.WorkspaceEvent
	var reading map[string]any
	missing := make([]string, 0)
	proof := "derived"
	if id := textValue(causation["ruleEventId"]); id != "" {
		item, e := r.store.GetWorkspaceEvent(req.Context(), id)
		if e == nil {
			ruleEvent = &item
			reading = object(item.Payload["reading"])
			proof = "proven"
		}
	}
	if ruleEvent == nil {
		missing = append(missing, "matched rule")
	}
	if reading == nil {
		missing = append(missing, "trigger sensor reading")
	}
	deviceID := textValue(command["deviceId"])
	commandName := textValue(command["command"])
	evidences := []map[string]any{evidence("device-execution", "Device command event", "proven", deviceID+" received "+commandName, &selected)}
	steps := make([]map[string]any, 0)
	if reading != nil {
		detail := fmt.Sprintf("%v %v", reading["value"], reading["unit"])
		evidences = append(evidences, evidence("trigger-reading", "Trigger sensor reading", proof, textValue(reading["sensorId"])+" reported "+detail, nil))
		steps = append(steps, map[string]any{"type": "sensor", "label": textValue(reading["sensorId"]), "detail": detail, "evidenceId": "trigger-reading", "support": proof})
	}
	var matched any
	if ruleEvent != nil {
		ruleID := textValue(ruleEvent.Payload["ruleId"])
		condition := object(ruleEvent.Payload["condition"])
		action := object(ruleEvent.Payload["action"])
		evidences = append(evidences, evidence("matched-rule", "Matched rule event", proof, ruleID+" configured "+deviceID+" "+commandName, ruleEvent))
		steps = append(steps, map[string]any{"type": "rule", "label": ruleID, "detail": fmt.Sprintf("%s %v %v", textValue(condition["operator"]), condition["value"], condition["unit"]), "evidenceId": "matched-rule", "support": proof})
		matched = map[string]any{"ruleId": ruleID, "condition": condition, "action": action}
	}
	steps = append(steps, map[string]any{"type": "execution", "label": deviceID, "detail": commandName, "evidenceId": "device-execution", "support": "proven"})
	completeness := "partial"
	summary := "This explanation is partial. The selected device command was found, but linked rule and sensor evidence could not be proven."
	if len(missing) == 0 {
		completeness = "complete"
		summary = deviceID + " received " + commandName + " because the recorded sensor reading satisfied the matched PostgreSQL rule."
	}
	response := map[string]any{"eventId": eventID, "explainable": true, "completeness": completeness, "title": "Why did " + deviceID + " " + commandName + "?", "summary": summary, "selectedEvent": selected, "deviceExecution": selected, "resultingState": result["state"], "missing": missing, "evidence": evidences, "causalSteps": steps}
	if reading != nil {
		response["triggerReading"] = reading
	}
	if matched != nil {
		response["matchedRule"] = matched
		response["ruleEvent"] = ruleEvent
	}
	writeJSON(w, 200, response)
}
