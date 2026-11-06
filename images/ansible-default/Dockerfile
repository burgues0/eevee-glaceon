FROM python:3.12-slim

# procps: pgrep/ps, the tools validation scripts need to check a service
# actually started (python:3.12-slim ships without them).
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir ansible-core

WORKDIR /app

COPY trigger.sh /app/trigger.sh
RUN chmod +x /app/trigger.sh

CMD ["/app/trigger.sh"]
