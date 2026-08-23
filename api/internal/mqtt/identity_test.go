package mqtt

import (
	"testing"

	"semantic-layer-explore/api/internal/config"
)

func TestResolveClientIDUsesStableHashedInstanceIdentity(t *testing.T) {
	cfg := config.Config{MQTTClientIDPrefix: "PhysicalAI-Go", MQTTInstanceID: "semantic-layer-api-7b6f95c9d4-x2abc"}

	first, instanceID, err := resolveClientID(cfg)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := resolveClientID(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("client ID is not stable: %q != %q", first, second)
	}
	if instanceID != cfg.MQTTInstanceID {
		t.Fatalf("unexpected instance identity: %q", instanceID)
	}
	if len(first) > maxPortableClientIDLength || !isPortableClientID(first) {
		t.Fatalf("client ID is not portable: %q", first)
	}
}

func TestResolveClientIDDiffersAcrossInstances(t *testing.T) {
	one, _, err := resolveClientID(config.Config{MQTTClientIDPrefix: "pago", MQTTInstanceID: "pod-uid-one"})
	if err != nil {
		t.Fatal(err)
	}
	two, _, err := resolveClientID(config.Config{MQTTClientIDPrefix: "pago", MQTTInstanceID: "pod-uid-two"})
	if err != nil {
		t.Fatal(err)
	}
	if one == two {
		t.Fatalf("different instances produced the same client ID: %q", one)
	}
}

func TestResolveClientIDValidatesExplicitOverride(t *testing.T) {
	clientID, _, err := resolveClientID(config.Config{MQTTClientID: "ExplicitClient01", MQTTInstanceID: "pod"})
	if err != nil {
		t.Fatal(err)
	}
	if clientID != "ExplicitClient01" {
		t.Fatalf("unexpected explicit client ID: %q", clientID)
	}
	if _, _, err := resolveClientID(config.Config{MQTTClientID: "invalid-client-id", MQTTInstanceID: "pod"}); err == nil {
		t.Fatal("expected invalid explicit client ID to fail")
	}
}

func TestSharedSubscription(t *testing.T) {
	got, err := sharedSubscription("physicalai-telemetry", "devices/+/telemetry")
	if err != nil {
		t.Fatal(err)
	}
	want := "$share/physicalai-telemetry/devices/+/telemetry"
	if got != want {
		t.Fatalf("shared subscription = %q, want %q", got, want)
	}
	if _, err := sharedSubscription("bad/group", "devices/+/telemetry"); err == nil {
		t.Fatal("expected invalid shared group to fail")
	}
}
