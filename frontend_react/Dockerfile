FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the app
RUN npm run build

EXPOSE 4173

# Serve the built app
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "4173"]
