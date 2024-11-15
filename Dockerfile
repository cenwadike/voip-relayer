# Use an official Node.js runtime as the base image
FROM node:18.16.0-alpine3.17

# Set the working directory in the container
RUN mkdir -p /opt/app
WORKDIR /opt/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# # Make sure that .env file exists
COPY .env ./.env

# # Copy the rest of the application code to the working directory
COPY ./ ./

# Command to run the application
CMD [ "npm", "run", "start"]