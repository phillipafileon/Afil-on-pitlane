FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server_v3.js ./
COPY runtime_terms_patch.cjs ./
COPY printful_probe.cjs ./
RUN node runtime_terms_patch.cjs
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh","-c","node printful_probe.cjs; npm start"]
