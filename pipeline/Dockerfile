FROM python:3.9-slim

WORKDIR /app

# Install system dependencies (if any specific C libraries are needed for Arrow)
# usually slim is fine for basic pyarrow
RUN apt-get update && apt-get install -y --no-install-recommends build-essential

# Install Python packages
# pyarrow and pandas are the heavy lifters here
RUN pip install --no-cache-dir pandas pyarrow numpy

COPY . .

CMD ["python", "etl_job.py"]
