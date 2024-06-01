FROM node:20.5.1-bullseye as install

RUN mkdir -p /src
WORKDIR /src
ADD src/. /src
ADD *.json /

RUN npm install

CMD npm start
