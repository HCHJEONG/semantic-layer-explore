# Physical AI Environment and Deployment Plan

This plan establishes the development and AWS deployment boundary before the Semantic Layer Explorer is changed into AI Physical Workspace.

## Fixed decisions

- Public URL: `https://ai.sampoongapt.com`
- Runtime: Next.js on the existing private AWS EC2 instance
- Container mapping: private EC2 `3010` → container `3000`
- Ingress: existing internet-facing ALB with a host-header rule
- Initial physical adapter: `simulator`
- Future physical adapter: `mqtt`
- Database file in production: `/app/data/ai-workspace.sqlite`
- Gemini model: `gemini-3.5-flash-lite`
- Vertex AI location: `global`
- EC2 credential source: `/home/ubuntu/gcp-key.json`
- Container credential mount: `/app/gcp-key.json:ro`

## Environment-file policy

- `.env.local` contains local development values and is excluded from Git and production Docker images.
- `.fordeploy/ai-workspace-aws/.env` contains the temporary production configuration. It is excluded from Git but intentionally included in the Docker build context.
- The root `.env.example` contains no secrets and remains tracked as the configuration reference.
- `gcp-key.json` is excluded from both Git and the Docker build context. The existing EC2 file is mounted read-only at runtime.

## Implementation sequence

### Phase 1 — Runtime conversion

1. Preserve the current Semantic Layer behavior while replacing the Sites/vinext-specific runtime with the standard Next.js standalone runtime used by `sampoongaptcom`.
2. Configure `output: "standalone"`.
3. Move from D1 to file-backed SQLite while preserving Drizzle and migrations.
4. Add an environment parser that validates all server variables at startup.

### Phase 2 — Local development environment

1. Add a persistent local `data/` directory ignored by Git.
2. Load `.env.local` through Next.js.
3. Verify the existing lawvot GCP credential file with the shared Vertex AI client pattern from `sampoongaptcom`.
4. Add health endpoints for the app, database, Gemini configuration, and active physical adapter.

### Phase 3 — AWS container environment

1. Add a multi-stage Node 22 Dockerfile matching the `sampoongaptcom` standalone pattern.
2. Copy only `.fordeploy/ai-workspace-aws/.env` into the image as `.env.production`, as explicitly selected for the initial operation period.
3. Mount `/home/ubuntu/gcp-key.json` and the AI Workspace data directory at runtime.
4. Run the container as a non-root user with `--restart unless-stopped`.
5. Map private EC2 port `3010` to container port `3000`.

### Phase 4 — ALB and DNS

1. Create an AI Workspace target group on port `3010`.
2. Use `/api/health` as the health-check path.
3. Add the `ai.sampoongapt.com` host-header rule to the existing HTTPS 443 listener.
4. Point the DNS record to the existing ALB.
5. Allow private EC2 port `3010` only from the ALB security group.

### Phase 5 — Simulator-ready application boundary

1. Define the common `PhysicalWorkspaceAdapter` contract.
2. Implement `SimulatorAdapter` first.
3. Keep `MqttAdapter` behind the same contract for later hardware integration.
4. Ensure Dashboard, Rule Engine, Gemini tools, and Event storage never depend directly on the simulator.

## Pre-implementation gates

- Actual environment files must remain ignored by Git.
- Credential files must remain outside the Docker image.
- The production environment must derive the project from the mounted service account JSON and resolve the same Gemini model and Vertex AI settings as `sampoongaptcom`.
- Existing Semantic Layer APIs must have regression coverage before the runtime conversion begins.
- The new container name, image name, port, environment path, and data volume must not overlap with `sampoongaptcom`.

## Manual deployment commands

Run the application deployment locally from a Bash environment that can read the existing SSH key:

```bash
cd /mnt/j/VSCodeProjects/semantic-layer-explore
LOCAL_SSH_KEY="$HOME/.ssh/penvotkeypair1.pem" ./.fordeploy/deploy.sh
```

The script transfers source through the Bastion, builds on the private EC2 instance, and only replaces the `ai-physical-workspace` container. It does not stop or remove `sampoongaptcom` containers or images.

After the container is ready, paste the following file into AWS CloudShell or upload and run it:

```bash
bash .fordeploy/ai-workspace-aws/aws-cloudshell-setup.sh
```

The CloudShell script is idempotent. It creates or reuses the port `3010` Target Group, limits EC2 ingress to the internet-facing ALB security group, installs the exact-host HTTPS Listener rule, and UPSERTs the Route 53 alias.
