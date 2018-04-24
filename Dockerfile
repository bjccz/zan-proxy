FROM node:8
WORKDIR /usr/src/app
EXPOSE 40001
EXPOSE 8001
EXPOSE 8989
COPY package*.json ./
RUN npm install
COPY . .
RUN node ./resetDataFile.js
CMD [ "node", "./dist/bin/index.js" ]