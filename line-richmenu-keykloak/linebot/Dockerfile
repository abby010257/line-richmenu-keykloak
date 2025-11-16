FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install --production --build-from-source
COPY . .

EXPOSE 8082

CMD ["node", "server_combined.js"]
