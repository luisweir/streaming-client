# README

DESCRIPTION

- [README](#readme)
  - [Features](#features)
  - [Configuration](#configuration)
  - [Installation](#installation)
  - [Run](#run)
  - [To-do](#to-do)

## Features

Features listed here

## Configuration

Before running the application all required environment variables must be set. If testing locally, the variable scan be set directly in the `.env` file.

```bash
# All environment variables described here

```

## Installation

- Install node:

  To easily install multiple versions of node locally, it is recommended to first install [node version manager (nvm)](https://github.com/nvm-sh/nvm) and then install the require version as following:

  ```bash
  NODE_VERSION=18.10.0
  nvm install $NODE_VERSION
  nvm alias default $NODE_VERSION
  nvm use default #to set this version of node as default in your environment
  nvm use #to set the node version based on the .nvmrc file
  ```

  > the above assumes you've installed nvm as described [here](https://github.com/nvm-sh/nvm). Note that when installing nvm will have to run curl with `--proxy` to set the web proxy accordingly.

- Install the node modules used in the project:

  All the dependencies are installed via `npm`

  ```bash
  npm install
  ```

- Install and configure the [Oracle Instant Client for NodeJS](https://www.oracle.com/database/technologies/appdev/quickstartnodejs.html).  Steps on how to do this for mac under <docs/typeorm.md>

## Run

Once all required environment variables have been set, project can be run by executing:

```bash
npm start
```

To run in development mode, execute

```bash
npm run dev
```

## To-do

Pending features here