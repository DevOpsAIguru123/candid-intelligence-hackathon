#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------------------
# GKE Deployment Script for Speaker Signal Platform
# ------------------------------------------------------------------------------

PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"
CLUSTER_NAME="speaker-signal-cluster"
REPO_NAME="speaker-signal-repo"
IMAGE_NAME="speaker-signal-app"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GCP project is not set. Set GCP_PROJECT environment variable or run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "=========================================================================="
echo " Deploying Speaker Signal App to Google Kubernetes Engine (GKE)"
echo " Project: $PROJECT_ID | Region: $REGION | Cluster: $CLUSTER_NAME"
echo "=========================================================================="

echo "Step 1: Enabling required Google Cloud APIs..."
gcloud services enable container.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID"

echo "Step 2: Checking Artifact Registry repository..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Creating Artifact Registry repository '$REPO_NAME' in $REGION..."
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Speaker Signal platform" \
    --project="$PROJECT_ID"
fi

IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:latest"

echo "Step 3: Building and pushing container image with Cloud Build..."
gcloud builds submit --tag="$IMAGE_URI" --project="$PROJECT_ID" .

echo "Step 4: Ensuring GKE Autopilot cluster '$CLUSTER_NAME' exists..."
if ! gcloud container clusters describe "$CLUSTER_NAME" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Creating GKE Autopilot cluster '$CLUSTER_NAME' in $REGION (this may take 4-6 minutes)..."
  gcloud container clusters create-auto "$CLUSTER_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID"
fi

echo "Step 5: Fetching cluster credentials for kubectl..."
gcloud container clusters get-credentials "$CLUSTER_NAME" --region="$REGION" --project="$PROJECT_ID"

echo "Step 6: Syncing credentials to Google Cloud Secret Manager & GKE..."
DATABASE_URL_VAL=$(grep '^DATABASE_URL=' .env.local 2>/dev/null | cut -d'=' -f2- || grep '^DATABASE_URL=' .env 2>/dev/null | cut -d'=' -f2- || true)
OPENAI_API_KEY_VAL=$(grep '^OPENAI_API_KEY=' .env.local 2>/dev/null | cut -d'=' -f2- || grep '^OPENAI_API_KEY=' .env 2>/dev/null | cut -d'=' -f2- || true)
FIRECRAWL_API_KEY_VAL=$(grep '^FIRECRAWL_API_KEY=' .env.local 2>/dev/null | cut -d'=' -f2- || grep '^FIRECRAWL_API_KEY=' .env 2>/dev/null | cut -d'=' -f2- || true)

create_or_update_gcp_secret() {
  local secret_name="$1"
  local secret_val="$2"

  if [ -n "$secret_val" ]; then
    if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
      echo "Creating GCP Secret Manager secret '$secret_name'..."
      echo -n "$secret_val" | gcloud secrets create "$secret_name" --data-file=- --project="$PROJECT_ID"
    else
      echo "Adding new version to GCP Secret Manager secret '$secret_name'..."
      echo -n "$secret_val" | gcloud secrets versions add "$secret_name" --data-file=- --project="$PROJECT_ID"
    fi
  fi
}

create_or_update_gcp_secret "speaker-signal-db-url" "$DATABASE_URL_VAL"
create_or_update_gcp_secret "speaker-signal-openai-api-key" "$OPENAI_API_KEY_VAL"
create_or_update_gcp_secret "speaker-signal-firecrawl-api-key" "$FIRECRAWL_API_KEY_VAL"

DB_URL_SECRET=$(gcloud secrets versions access latest --secret="speaker-signal-db-url" --project="$PROJECT_ID" 2>/dev/null || echo "$DATABASE_URL_VAL")
OPENAI_SECRET=$(gcloud secrets versions access latest --secret="speaker-signal-openai-api-key" --project="$PROJECT_ID" 2>/dev/null || echo "$OPENAI_API_KEY_VAL")
FIRECRAWL_SECRET=$(gcloud secrets versions access latest --secret="speaker-signal-firecrawl-api-key" --project="$PROJECT_ID" 2>/dev/null || echo "$FIRECRAWL_API_KEY_VAL")

kubectl create secret generic speaker-signal-secrets \
  --from-literal=DATABASE_URL="$DB_URL_SECRET" \
  --from-literal=OPENAI_API_KEY="$OPENAI_SECRET" \
  --from-literal=FIRECRAWL_API_KEY="$FIRECRAWL_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Step 7: Deploying Kubernetes manifests..."
sed -e "s|LOCATION-docker.pkg.dev/PROJECT_ID|$REGION-docker.pkg.dev/$PROJECT_ID|g" k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml

echo "Step 8: Waiting for deployment rollout..."
kubectl rollout status deployment/speaker-signal-app --timeout=180s

echo "=========================================================================="
echo " GKE Deployment Successful!"
echo " Service Status:"
kubectl get service speaker-signal-service
echo "=========================================================================="
