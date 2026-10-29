FROM node:24-alpine

RUN mkdir -p /var/app

# Create app directory
WORKDIR /var/app

COPY package*.json ./

# Bundle app source
RUN npm install

COPY . .

USER root

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]