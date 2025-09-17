## Nango: Integrated Setup and Framework Configuration

This guide covers how to configure the Agent Framework to work with the **integrated Nango setup** (recommended approach).

### 1) Start Nango (Integrated Setup)

Nango runs as part of the main development stack:

```bash
# Generate encryption key and create .env file
cp deploy/docker/.env.nango.example deploy/docker/.env && encryption_key=$(openssl rand -base64 32) && sed -i '' "s|REPLACE_WITH_BASE64_256BIT_ENCRYPTION_KEY|$encryption_key|" deploy/docker/.env && echo "Docker environment file created with auto-generated encryption key"

# Start the full stack from deploy/docker (includes Nango + observability)
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

```bash
# Update .env files with your Nango secret key
printf "Enter your Nango secret key: " && read key && sed -i '' "s|^NANGO_SECRET_KEY=.*|NANGO_SECRET_KEY=$key|" agents-manage-api/.env agents-run-api/.env agents-manage-ui/.env && echo "Application files updated with Nango secret key"
```

**Restart your development processes** to pick up the new environment variables.

### 3) Verify the integration

Test that everything is working correctly:

1. **Launch the Agent Builder app** (after configuring `.env` files above)
2. **Navigate to the Credentials page**: `/credentials`
3. **Click "New Credential"**
4. **Select "Bearer Authentication"**:
5. **Fill in the form**:
    - Name: `your-api-key-name`
    - API Key: `your-api-key`
6. **Click "Create Credential"**
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
# Leave NANGO_HOST and NANGO_CONNECT_BASE_URL unset
```

**Note:** When using Nango Cloud, omit the `NANGO_HOST` environment variables to automatically use the cloud endpoints.

### References

- **Nango Documentation**: [docs.nango.dev](https://docs.nango.dev)
- **Self-hosting Config**: [docs.nango.dev/guides/self-hosting/free-self-hosting/configuration](https://docs.nango.dev/guides/self-hosting/free-self-hosting/configuration)
- **Local Setup**: [docs.nango.dev/guides/self-hosting/free-self-hosting/locally](https://docs.nango.dev/guides/self-hosting/free-self-hosting/locally)
- **Nango GitHub**: [github.com/NangoHQ/nango](https://github.com/NangoHQ/nango)

