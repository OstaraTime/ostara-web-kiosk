FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY dist /usr/share/nginx/html/kiosk
COPY logo.png /usr/share/nginx/html/kiosk/logo.png

EXPOSE 80
