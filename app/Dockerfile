FROM node:20-alpine

RUN apk add --no-cache iputils

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
ENV DB_PATH=/app/data/app.db

EXPOSE 3000

CMD ["node", "server.js"]
