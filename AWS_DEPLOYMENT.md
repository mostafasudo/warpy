# AWS Production Infrastructure Reference

This document describes the current production deployment (AWS + Cloudflare + Clerk). It is not a step-by-step setup guide.

## High-level architecture

- Frontend (React) runs on ECS Fargate behind an ALB.
- Backend (FastAPI) runs on ECS Fargate behind the same ALB.
- Worker (RQ) runs on ECS Fargate with no public ingress.
- Database is Aurora PostgreSQL Serverless v2 (with pgvector, managed via Alembic migrations).
- Redis is ElastiCache for Redis (Serverless).
- Widget script is served from S3 + CloudFront at `https://cdn.warpy.ai/widget.js`.

CI/CD is managed by `.github/workflows/deploy-production.yml`.

## Key production values (as of 2026-01-01)

- Region: `us-east-1`
- ECS cluster: `warpy`
- ECS services: `warpy-prod-backend`, `warpy-prod-worker`, `warpy-prod-frontend`
- ECR repos: `warpy-backend`, `warpy-frontend`
- ALB name: `warpy-alb`
- ALB DNS: `warpy-alb-115735523.us-east-1.elb.amazonaws.com`
- CloudFront distribution ID: `EO616FX57ED6X`
- CloudFront domain: `dktffu8frsa23.cloudfront.net`
- S3 bucket (CloudFront origin): `warpy-ai-prod-cdn`
- Aurora cluster name: `warpy`
- Aurora writer endpoint: `warpy.cluster-c89u8sy422uv.us-east-1.rds.amazonaws.com`
- VPC name: `warpy-prod-vpc` (`vpc-06058e596a99d4cdc`)

If any of these change, update this file.

## Public endpoints

- App: `https://app.warpy.ai` → ALB → `warpy-prod-frontend-tg`
- API: `https://api.warpy.ai` → ALB → `warpy-prod-backend-tg`
- Widget: `https://cdn.warpy.ai/widget.js` → CloudFront → S3

## DNS (Cloudflare)

All records used for validation/custom domains should be **DNS only** (not proxied), unless explicitly required otherwise.

- `app.warpy.ai` CNAME → `warpy-alb-115735523.us-east-1.elb.amazonaws.com`
- `api.warpy.ai` CNAME → `warpy-alb-115735523.us-east-1.elb.amazonaws.com`
- `cdn.warpy.ai` CNAME → `dktffu8frsa23.cloudfront.net`

Clerk custom domain CNAMEs (from Clerk → Domains):

- `clerk.warpy.ai` CNAME → `frontend-api.clerk.services`
- `accounts.warpy.ai` CNAME → `accounts.clerk.services`
- `clkmail.warpy.ai` CNAME → `mail.lqx7igdkiwea.clerk.services`
- `clk._domainkey.warpy.ai` CNAME → `dkim1.lqx7igdkiwea.clerk.services`
- `clk2._domainkey.warpy.ai` CNAME → `dkim2.lqx7igdkiwea.clerk.services`

ACM validation records (from AWS ACM) must also remain **DNS only**.

## TLS (ACM)

- ACM certificate is issued in `us-east-1` for `app.warpy.ai`, `api.warpy.ai`, `cdn.warpy.ai`.
- ALB listener `443` uses the ACM certificate (app + api).
- CloudFront uses an ACM certificate in `us-east-1` for `cdn.warpy.ai`.

## Networking (VPC)

Design: ALB + ECS tasks are in **public** subnets with **public IPs** enabled (no NAT). Aurora + Redis remain private.

- VPC: `warpy-prod-vpc` (`vpc-06058e596a99d4cdc`)
- Public subnets (ECS/ALB):
  - `subnet-0e1f6f13d3ecc21f1` (us-east-1a)
  - `subnet-03e665872a4376b21` (us-east-1b)

Security groups:

- `warpy-prod-alb-sg`: inbound `80/443` from `0.0.0.0/0`
- `warpy-prod-ecs-sg`: inbound `80/8000` from `warpy-prod-alb-sg`
- `warpy-prod-db-sg`: inbound `5432` from `warpy-prod-ecs-sg`
- `warpy-prod-redis-sg`: inbound `6379` from `warpy-prod-ecs-sg`

## Compute (ECS Fargate)

### Load balancer routing

- Target group `warpy-prod-backend-tg`: HTTP `8000`, health check `/health`
- Target group `warpy-prod-frontend-tg`: HTTP `80`, health check `/`
- Listener `443`:
  - host `api.warpy.ai` → `warpy-prod-backend-tg`
  - default → `warpy-prod-frontend-tg`
- Listener `80`: redirects to HTTPS

### Services

- `warpy-prod-backend`: attached to `warpy-prod-backend-tg`
- `warpy-prod-frontend`: attached to `warpy-prod-frontend-tg`
- `warpy-prod-worker`: no load balancer

### Task definitions

Source of truth is `aws/ecs/*.taskdef.json`. GitHub Actions registers revisions and syncs env vars from GitHub Secrets on deploy.

Resource sizing (from templates):

- backend: `cpu=512`, `memory=1024`
- worker: `cpu=512`, `memory=1024`
- frontend: `cpu=256`, `memory=512`

Logs:

- `/ecs/warpy-prod-backend`
- `/ecs/warpy-prod-worker`
- `/ecs/warpy-prod-frontend`

## Database (Aurora PostgreSQL Serverless v2)

- Cluster: `warpy`
- Writer endpoint: `warpy.cluster-c89u8sy422uv.us-east-1.rds.amazonaws.com:5432`
- Database name: `warpy` (must exist; migrations assume it)
- DB security group: `warpy-prod-db-sg`

## Redis (ElastiCache Serverless)

- Redis URL format used by the app: `rediss://<REDIS_ENDPOINT>:6379/0`
- RQ runs against Redis Cluster using a single hash-slot keyspace (`backend/app/workers/rq_keyspace.py`) to avoid cross-slot errors.

## Widget delivery (S3 + CloudFront)

- Bucket: `warpy-ai-prod-cdn` (private; accessed via OAC)
- CloudFront distribution ID: `EO616FX57ED6X`
- CloudFront domain: `dktffu8frsa23.cloudfront.net`
- Widget URL: `https://cdn.warpy.ai/widget.js`

Deployment behavior:

- Workflow uploads `frontend/public/widget/agent.js` to S3 as `widget.js`.
- Workflow invalidates CloudFront distribution after upload.

## Deployments (GitHub Actions)

Workflow: `.github/workflows/deploy-production.yml` (runs on push to `main`)

What it does:

- Builds and pushes backend/frontend images to ECR.
- Registers/updates ECS task definitions and syncs backend/worker env vars from GitHub Secrets.
- Runs `alembic upgrade head` as a one-off ECS task before updating services.
- Updates ECS services to the new task definition revisions.
- Uploads widget to S3 and invalidates CloudFront.

GitHub Actions configuration (prod):

- Secrets (sensitive): `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_REGION`, `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, plus optional LangSmith/widget vars.
- Variables (non-sensitive): ECR repo names, ECS cluster/service names, widget bucket, widget CloudFront distribution ID.

For adding/changing env vars, follow the repo env-var guide in `README.md` / `AGENTS.md`.

## Operational checks

- API health: `https://api.warpy.ai/health` → `{"status":"healthy"}`
- ALB target health: EC2 → Target groups → Targets should be healthy
- Logs: CloudWatch log groups under `/ecs/*`
