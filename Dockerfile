FROM node:20-alpine
WORKDIR /app
COPY web/package.json ./
RUN npm install --omit=dev
COPY web/index.html web/server.mjs ./
ENV NODE_ENV=production
CMD ["npm","start"]