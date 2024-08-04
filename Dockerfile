FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN yarn install

COPY src/ ./src/
RUN yarn build
RUN mkdir data
EXPOSE 5300
CMD ["node","dist/index.js"]