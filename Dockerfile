# Frontend build stage
FROM node:lts-alpine AS frontend-builder
WORKDIR /app/frontend

# Install pnpm globally using npm (which comes with node images)
RUN npm install -g pnpm

# Copy package manager files and tsconfig/vite config
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source code
COPY src ./src
COPY public ./public
COPY index.html ./index.html


# Build frontend
RUN pnpm build

# Backend runtime stage
FROM python:3.9-slim
WORKDIR /app

# Copy backend requirements and install dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend application code
COPY backend ./backend

# Copy built frontend static files from the frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist ./backend/dist

# Expose backend port
EXPOSE 5001

# Set the command to run the application
CMD ["python", "backend/app.py"]