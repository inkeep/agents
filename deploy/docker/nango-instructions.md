## Nango: Integrated Setup and Framework Configuration

This guide covers how to configure the Agent Framework to work with the **integrated Nango setup** (recommended approach).

### 1) Start Nango (Integrated Setup)

Nango runs as part of the main development stack:

```bash
# First-time setup: Create .env file
cp .env.nango.example .env

# Generate encryption key and update .env
openssl rand -base64 32
# Edit .env and replace REPLACE_WITH_BASE64_256BIT_ENCRYPTION_KEY with the generated key

# Start the full stack from agent-framework root (includes Nango + observability)
docker compose up -d
```

**Services included:**
- **Nango Server**: `http://localhost:3050` (Dashboard/API)
- **Nango Connect UI**: `http://localhost:3051` (OAuth flows)
- **PostgreSQL**: Database for Nango
- **Redis**: Caching for Nango

### 2) Configure the framework applications to use Nango

Once Nango is running, configure the framework applications to connect to your local instance.

**Important:** Use real credentials from your Nango dashboard (no placeholders). The framework rejects `your_nango_secret_key`.

#### Get your Nango API Key

1. Open the Nango Dashboard: `http://localhost:3050`
2. Navigate to **Environment Settings** → **API Keys**
3. Copy your **Secret Key** (starts with `123abc...`)

#### Configure Application Environment Files

**`/agents-manage-api/.env` and `/agents-run-api/.env`**
```bash
# Admin API key from your local Nango dashboard
NANGO_SECRET_KEY="123abc..."

# Point to your integrated Nango instance
NANGO_HOST="http://localhost:3050"
```

**`/agents-manage-ui/.env`**
```bash
# Admin API key from your local Nango dashboard (server-side calls)
NANGO_SECRET_KEY="123abc..."

# Frontend should point to your integrated Nango instance
NEXT_PUBLIC_NANGO_HOST="http://localhost:3050"

# Connect UI endpoint
NEXT_PUBLIC_NANGO_CONNECT_BASE_URL="http://localhost:3051"
```

**Restart your development processes** to pick up the new environment variables.

### 3) Verify the integration

Test that everything is working correctly:

1. **Launch the Agent Builder app** (after configuring `.env` files above)
2. **Navigate to the Credentials page**: `/credentials`
3. **Click "Create new credential"**
4. **Select in the form**:
   - Auth type: Bearer Auth
   - Credential type: Standalone Credential
5. **Click "Create Credential"**
6. **In the Nango auth pop-up**: Enter your API key
7. **Click "Connect"**, then **"Finish"**
8. **Refresh the Credentials page** and verify the new credential appears

### 4) Managing the integrated setup

**View logs:**
```bash
# View Nango logs
docker compose logs nango-server -f

# View all services
docker compose logs -f
```

**Update Nango:**
```bash
# Update providers (new integrations) - optional
curl -o providers.yaml https://raw.githubusercontent.com/NangoHQ/nango/master/packages/providers/providers.yaml

# Update Docker image
docker compose pull nango-server
docker compose up -d nango-server
```

**Reset Nango data:**
```bash
# Stop services
docker compose down

# Remove Nango data (caution: this deletes all configurations and connections)
docker volume rm agent-framework_nango_data

# Restart
docker compose up -d
```

---

## Alternative: Separate Nango Repository Setup

If you prefer to use the official Nango repository separately (not recommended for development):

1. **Clone Nango**: `git clone https://github.com/NangoHQ/nango && cd nango`
2. **Configure**: `cp .env.example .env` (edit with your settings)
3. **Start**: `docker compose up -d`
4. **Configure framework**: Use the same application `.env` configurations above

## Alternative: Use Nango Cloud

Instead of self-hosting Nango, you can use Nango Cloud:

1. **Create a Nango Cloud account**: Visit [nango.dev](https://nango.dev)
2. **Get your Secret Key**: Find it in Environment Settings
3. **Configure environment variables**:

#### Configure Application Environment Files

**`/agents-manage-api/.env` and `/agents-run-api/.env`**

```bash
# Nango Cloud configuration
NANGO_SECRET_KEY="123abc..."
# Leave NANGO_HOST unset to use Nango Cloud
```

**`/agents-manage-ui/.env`**
```bash
# Nango Cloud configuration (server-side calls)
NANGO_SECRET_KEY="123abc..."
# Leave NEXT_PUBLIC_NANGO_HOST and NEXT_PUBLIC_NANGO_CONNECT_BASE_URL unset
```

**Note:** When using Nango Cloud, omit the `NANGO_HOST` environment variables to automatically use the cloud endpoints.

### References

- **Nango Documentation**: [docs.nango.dev](https://docs.nango.dev)
- **Self-hosting Config**: [docs.nango.dev/guides/self-hosting/free-self-hosting/configuration](https://docs.nango.dev/guides/self-hosting/free-self-hosting/configuration)
- **Local Setup**: [docs.nango.dev/guides/self-hosting/free-self-hosting/locally](https://docs.nango.dev/guides/self-hosting/free-self-hosting/locally)
- **Nango GitHub**: [github.com/NangoHQ/nango](https://github.com/NangoHQ/nango)

