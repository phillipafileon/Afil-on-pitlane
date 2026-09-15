FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server_v3.js ./
COPY runtime_terms_patch.cjs ./
COPY runtime_printful_shop_patch.cjs ./
COPY fix_printful_patch.cjs ./
RUN node runtime_terms_patch.cjs
RUN node fix_printful_patch.cjs
RUN node runtime_printful_shop_patch.cjs
ENV NODE_ENV=production
EXPOSE 3000
# Afiléon Printful shop + webhook integration
CMD ["npm","start"]
