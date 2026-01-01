# AWS Deployment (ECS Fargate + Aurora + ElastiCache + CloudFront)

## What you’ll deploy

- **Frontend (React)**: container on **ECS Fargate** behind an **ALB**
- **Backend (FastAPI)**: container on **ECS Fargate** behind an **ALB**
- **Worker (RQ)**: container on **ECS Fargate** (no public ingress)
- **Database**: **Aurora PostgreSQL Serverless** (PGVector via migrations)
- **Redis**: **ElastiCache for Redis** (or ElastiCache Serverless)
- **Widget script**: served from **S3 + CloudFront** at `https://cdn.warpy.ai/widget.js`

This repo already includes a production GitHub Actions workflow: `.github/workflows/deploy-production.yml`.

## Names and domains used in this guide

This guide assumes these exact values:

- **Region**: `us-east-1`
- **App domain**: `app.warpy.ai`
- **API domain**: `api.warpy.ai`
- **CDN domain**: `cdn.warpy.ai`
- **ECS cluster**: `warpy`
- **ECS services**: `warpy-prod-backend`, `warpy-prod-worker`, `warpy-prod-frontend`
- **ECR repos**: `warpy-backend`, `warpy-frontend`
- **S3 bucket (CloudFront origin)**: `warpy-ai-prod-cdn`

If AWS says `warpy-ai-prod-cdn` is already taken, append a short suffix and use that exact bucket name everywhere below.

## 1) AWS credentials

Your `AWS_ACCESS_KEY` / `AWS_SECRET_KEY` already belong to an IAM user with `AdministratorAccess`, so you can use them as-is.

## 2) DNS + TLS (Cloudflare + ACM)

1. ACM (region `us-east-1`) → **Request** a public certificate for:
   - `app.warpy.ai`
   - `api.warpy.ai`
   - `cdn.warpy.ai`
2. Validate via DNS:
   - ACM will give you CNAME validation records
   - Add those CNAME records in Cloudflare DNS
   - Ensure the ACM validation CNAME records are **DNS only** (not proxied)

You will use this certificate for both the ALB listener (app + api) and CloudFront (cdn).

## 3) Networking (VPC + subnets + security groups)

Use **one VPC** with **public subnets for ALB + ECS** and **private subnets for Aurora/Redis**.

1. AWS Console → **VPC** → **Create VPC** → “VPC and more”
2. Name the VPC: `warpy-prod-vpc`
3. Create:
   - 2 public subnets (2 AZs)
   - 2 private subnets (2 AZs)
4. To avoid NAT fixed costs, keep ECS tasks in **public** subnets with **public IPs** (Aurora/Redis stay private).

Create security groups:

- `warpy-prod-alb-sg`
  - Inbound: `80` (HTTP) + `443` (HTTPS) from `0.0.0.0/0`
  - Outbound: all
- `warpy-prod-ecs-sg`
  - Inbound: `80` and `8000` **from** `warpy-prod-alb-sg`
  - Outbound: all
- `warpy-prod-db-sg`
  - Inbound: `5432` **from** `warpy-prod-ecs-sg`
- `warpy-prod-redis-sg`
  - Inbound: `6379` **from** `warpy-prod-ecs-sg`

## 4) Aurora Serverless (Postgres + pgvector)

1. AWS Console → **RDS** → **Create database**
2. Choose:
   - Engine: **Aurora PostgreSQL**
   - DB instance class: **Serverless v2** (do not choose a fixed instance class)
   - Aurora capacity range: min `0` ACU, max `8` ACU (enables auto-pause during inactivity)
   - Cluster storage configuration: **Aurora Standard**
   - Credentials management: **Self managed**
3. Networking:
   - VPC: the one from step 3
   - DB subnet group: create a new one using **private** subnets only
   - Public access: **No**
   - Security group: `warpy-prod-db-sg`
4. Additional configuration:
   - Initial database name: `warpy`
5. Save the **writer endpoint**.

Set your backend `DATABASE_URL` to:

`postgresql+psycopg2://postgres:<PASSWORD>@<AURORA_WRITER_ENDPOINT>:5432/warpy?sslmode=require`

## 5) ElastiCache (Redis)

1. AWS Console → **ElastiCache** → **Redis** → **Create**
2. Choose **Serverless** if available in your region (best pay‑as‑you‑go), otherwise a small node.
3. Networking:
   - VPC: the one from step 3
   - Subnets: **private** subnets
   - Security group: `warpy-prod-redis-sg`
4. Save the Redis endpoint.

Set your backend `REDIS_URL` to:

`rediss://<REDIS_ENDPOINT>:6379/0`

## 6) ECR repositories

1. AWS Console → **ECR** → **Repositories** → **Create**
2. Create:
   - `warpy-backend`
   - `warpy-frontend`
3. Copy the repository URIs:
   - `warpy-backend` repository URI (you will use it as the image prefix in ECS)
   - `warpy-frontend` repository URI

## 7) ECS cluster + services (backend, worker, frontend)

### 7.1 Create an ECS cluster

1. AWS Console → **ECS** → **Clusters** → **Create**
2. Choose **Networking only (Fargate)**
3. Name: `warpy`

### 7.2 Create an ALB (one ALB, host-based routing)

1. AWS Console → **EC2** → **Load balancers** → **Create**
2. Type: **Application Load Balancer**
3. Listener: `443` (HTTPS) and `80` (HTTP)
4. Subnets: **public** subnets
5. SG: `warpy-prod-alb-sg`
6. Create 2 target groups:
   - `warpy-prod-backend-tg` (HTTP, port `8000`, health check path `/health`)
   - `warpy-prod-frontend-tg` (HTTP, port `80`, health check path `/`)
7. `443` listener:
   - Attach the ACM certificate you created in step 2
   - Add host-based rules:
     - Host `api.warpy.ai` → forward to `warpy-prod-backend-tg`
     - Host `app.warpy.ai` → forward to `warpy-prod-frontend-tg` (or default)
8. `80` listener:
   - Add a redirect action to HTTPS

### 7.3 Create task definitions

If you are using GitHub Actions to create task definitions, do **section 10 (GitHub Actions configuration)** now and push to `main` once. The workflow will register the task definition families for you (it will still fail until services exist).

After services exist, GitHub Actions will keep the **backend/worker env vars** in sync from GitHub Secrets on every deploy.

Create three task definitions (Fargate) with 1 container each:

- `warpy-prod-backend`
  - Image: `warpy-backend` repository URI + `:latest`
  - Container port: `8000`
  - Env vars:
    - `ENVIRONMENT=production`
    - `DATABASE_URL=...`
    - `REDIS_URL=...`
    - `CLERK_SECRET_KEY=...`
    - `OPENAI_API_KEY=...`
    - `LANGSMITH_*` (optional)
    - `WIDGET_JWT_SECRET=...` (required if widget signed tokens enabled)
    - `TEST_WIDGET_TOKEN_API_KEY=...` (optional)
- `warpy-prod-worker`
  - Image: `warpy-backend` repository URI + `:latest`
  - Command override: `sh -c 'rq worker default --url "$REDIS_URL"'`
  - Same env vars as backend (needs DB + Redis + AI keys)
- `warpy-prod-frontend`
  - Image: `warpy-frontend` repository URI + `:latest`
  - Container port: `80`
  - No runtime env vars needed (built at image build time)

For all tasks:

- Subnets: **public**
- Public IP: **enabled**
- SG: `warpy-prod-ecs-sg`
- Logs: send to CloudWatch Logs

### 7.4 Create services

Before you can create services, the task definition families must exist (either created manually, or bootstrapped by the GitHub Actions workflow).

Create ECS services:

- `warpy-prod-backend` → attach to `warpy-prod-backend-tg`
- `warpy-prod-frontend` → attach to `warpy-prod-frontend-tg`
- `warpy-prod-worker` → **no load balancer**

Start with desired count `0` for each (you’ll scale up after the first deploy).

## 8) Widget hosting (S3 + CloudFront)

### 8.1 Create the S3 bucket

1. AWS Console → **S3** → **Create bucket**
2. Name: `warpy-ai-prod-cdn`
3. Keep “Block all public access” enabled

### 8.2 Create CloudFront distribution

1. AWS Console → **CloudFront** → **Create distribution**
2. Origin: S3 bucket `warpy-ai-prod-cdn`
3. Use **Origin Access Control (OAC)** and apply the generated bucket policy
4. Default behavior:
   - Viewer protocol policy: Redirect HTTP to HTTPS
   - Cache policy: CachingOptimized (ok)
5. Alternate domain name (CNAME): `cdn.warpy.ai`
6. ACM certificate: the one you created in step 2 (must be in **us-east-1**)
7. Note:
   - Distribution ID (for GitHub Actions invalidations)
   - CloudFront domain name

Your widget script URL will be:

`https://cdn.warpy.ai/widget.js`

The GitHub Actions workflow uploads `frontend/public/widget/agent.js` to S3 as `widget.js`.

## 9) Cloudflare DNS records (app + api + cdn)

Create these DNS records in Cloudflare (DNS only is recommended):

- `app.warpy.ai` → **CNAME** to the ALB DNS name
- `api.warpy.ai` → **CNAME** to the ALB DNS name
- `cdn.warpy.ai` → **CNAME** to the CloudFront distribution domain name

## 10) GitHub Actions configuration

The workflow deploys on every push to `main`: `.github/workflows/deploy-production.yml`.

### 10.1 GitHub secrets (Settings → Secrets and variables → Actions → Secrets)

Add:

- `AWS_ACCESS_KEY`
- `AWS_SECRET_KEY`
- `AWS_REGION` = `us-east-1`
- `VITE_API_URL` = `https://api.warpy.ai`
- `VITE_API_TIMEOUT_MS` = `5000`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_WIDGET_CDN_URL` = `https://cdn.warpy.ai/widget.js` (optional)
- `DATABASE_URL` (required)
- `REDIS_URL` (required)
- `CLERK_SECRET_KEY` (required)
- `OPENAI_API_KEY` (required)
- `LANGSMITH_TRACING` (optional)
- `LANGSMITH_ENDPOINT` (optional)
- `LANGSMITH_API_KEY` (optional)
- `LANGSMITH_PROJECT` (optional)
- `WIDGET_JWT_SECRET` (optional)
- `TEST_WIDGET_TOKEN_API_KEY` (optional)

### 10.2 GitHub variables (Settings → Secrets and variables → Actions → Variables)

Add:

- `ECR_REPOSITORY_BACKEND` = `warpy-backend`
- `ECR_REPOSITORY_FRONTEND` = `warpy-frontend`
- `ECS_CLUSTER` = `warpy`
- `ECS_SERVICE_BACKEND` = `warpy-prod-backend`
- `ECS_SERVICE_FRONTEND` = `warpy-prod-frontend`
- `ECS_SERVICE_WORKER` = `warpy-prod-worker`
- `WIDGET_S3_BUCKET` = `warpy-ai-prod-cdn`
- `WIDGET_CLOUDFRONT_DISTRIBUTION_ID` = the CloudFront Distribution ID from step 8.2
- `ECS_TASK_EXECUTION_ROLE_ARN` (optional; defaults to `ecsTaskExecutionRole`)


## 11) First deploy + migrations

1. Push to `main` to publish images + update ECS services. The workflow runs `alembic upgrade head` automatically as a one-off ECS task before updating the services.
2. Scale services up to `1` desired task each:
   - ECS → Clusters → `warpy` → Services → update:
     - `warpy-prod-backend` desired tasks = `1`
     - `warpy-prod-frontend` desired tasks = `1`
     - `warpy-prod-worker` desired tasks = `1`
3. Confirm:
   - `https://api.warpy.ai/health` returns `{"status":"healthy"}`
   - Frontend loads at `https://app.warpy.ai`

## 12) Widget embed (production)

The widget talks to Warpy at `https://api.warpy.ai` in production (and `http://localhost:8000` when running on `localhost`).

```html
<script
  src="https://cdn.warpy.ai/widget.js"
  data-agent-id="YOUR_AGENT_UUID"
  data-base-url="https://YOUR_DASHBOARD_BASE_URL/"
></script>
```

`data-base-url` is the customer dashboard API base used for tool calls.

Finally, Once You are done with the above, update this file to serve as an infrastructure reference rather than a setup guide.
