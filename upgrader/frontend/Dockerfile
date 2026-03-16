FROM node:20-slim

WORKDIR /app

# Enable Next.js telemetry collection off (optional)
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first (caching)
COPY package.json package-lock.json* ./
RUN rm -f package-lock.json
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

ENV HOSTNAME="0.0.0.0"

# Start development server
CMD ["npm", "run", "dev"]
