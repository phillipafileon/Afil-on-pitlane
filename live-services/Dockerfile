FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server_v3.js ./
COPY runtime_terms_patch.cjs ./
COPY runtime_printful_shop_patch.cjs ./
COPY runtime_shop_image_patch.cjs ./
COPY fix_printful_patch.cjs ./
COPY runtime_stripe_refund_patch.cjs ./
COPY runtime_stripe_webhook_events_patch.cjs ./
COPY runtime_booking_pricing_patch.cjs ./
COPY runtime_booking_patch_compat.cjs ./
COPY runtime_quote_travel_patch.cjs ./
COPY runtime_booking_cutoffs_slots_patch.cjs ./
COPY runtime_cutoff_correction_patch.cjs ./
COPY runtime_cutoff_session_expirer_patch.cjs ./
RUN node runtime_terms_patch.cjs
RUN node fix_printful_patch.cjs
RUN node runtime_printful_shop_patch.cjs
RUN node runtime_shop_image_patch.cjs
RUN node runtime_stripe_refund_patch.cjs
RUN node runtime_stripe_webhook_events_patch.cjs
RUN node runtime_booking_patch_compat.cjs
RUN node runtime_booking_pricing_patch.cjs
RUN node runtime_quote_travel_patch.cjs
RUN node runtime_booking_cutoffs_slots_patch.cjs
RUN node runtime_cutoff_correction_patch.cjs
RUN node runtime_cutoff_session_expirer_patch.cjs
ENV NODE_ENV=production
EXPOSE 3000
# Afiléon Printful shop + webhook integration
CMD ["npm","start"]
