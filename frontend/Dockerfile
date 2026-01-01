FROM node:20-alpine AS builder

WORKDIR /app
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH="$PNPM_HOME/bin:$PATH"

RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_TIMEOUT_MS
ARG VITE_WIDGET_CDN_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_TIMEOUT_MS=$VITE_API_TIMEOUT_MS
ENV VITE_WIDGET_CDN_URL=$VITE_WIDGET_CDN_URL

RUN test -n "$VITE_API_URL" && test -n "$VITE_API_TIMEOUT_MS" && test -n "$VITE_CLERK_PUBLISHABLE_KEY"

RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
