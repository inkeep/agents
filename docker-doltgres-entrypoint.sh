#!/bin/bash
set -e

# Start doltgres in the background
doltgres -config /etc/doltgres/config.yaml &
DOLTGRES_PID=$!

echo "Waiting for Doltgres to start..."
# Wait for Doltgres to be ready
for i in {1..30}; do
    if PGPASSWORD=password psql -h localhost -U postgres -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo "Doltgres is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Timeout waiting for Doltgres to start"
        exit 1
    fi
    sleep 1
done

# Check if initialization is needed
INIT_FLAG="/var/lib/doltgres/.initialized"
if [ ! -f "$INIT_FLAG" ]; then
    echo "Running initialization scripts..."
    
    # Run all SQL files in /docker-entrypoint-initdb.d/
    if [ -d /docker-entrypoint-initdb.d ]; then
        for f in /docker-entrypoint-initdb.d/*.sql; do
            if [ -f "$f" ]; then
                echo "Running $f..."
                PGPASSWORD=password psql -h localhost -U postgres -d postgres -f "$f"
            fi
        done
    fi
    
    # Mark as initialized
    touch "$INIT_FLAG"
    echo "Initialization complete!"
else
    echo "Database already initialized, skipping initialization scripts."
fi

# Wait for doltgres process
wait $DOLTGRES_PID