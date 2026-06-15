# Placeholder Dockerfile for scraper service (no special build steps)
# Uses a lightweight Python image; actual scraper code will be run via the entrypoint.

FROM python:3.12-slim
WORKDIR /app
COPY . .
# Install any dependencies if a requirements.txt exists (optional)
RUN if [ -f requirements.txt ]; then pip install -r requirements.txt; else echo "No requirements to install"; fi

# Default command – keep container running (or replace with actual script)
CMD ["sleep", "infinity"]