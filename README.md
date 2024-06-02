# Streaming Client

Sample GraphQL Streaming client for the [Oracle Hospitality Integration Platform (OHIP)](https://www.oracle.com/uk/industries/hospitality/integration-platform/) [Streaming API](https://blogs.oracle.com/hospitality/post/ohip-introduces-state-of-the-art-streaming-api-and-rich-analytics).

> `Important`: This is **NOT** an official GraphQL Subscription Client for the OHIP Streaming API. It is a **sample client** built for demo purposes. Use it at your own risk.

- [Streaming Client](#streaming-client)
  - [Features](#features)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Run](#run)
  - [License](#license)
  - [Disclaimer](#disclaimer)

## Features

- Load connection/stream parameters from environment variables
- Automatic refresh of OAuth tokens every 59 minutes (including 500ms delay between disconnecting and re-connecting to avoid `4409`)
- Automatic reconnection in case of network intermittent errors or server failures
- detail logs at different levels (info, debug, silly)
- Statistics around number of messages processed per second, minute or hour as well as total number of messages received per event type
- Support for subscription parameters: chain, hotelId, offset (partial only) and delta.

## Installation

- Install node:

  To easily install multiple versions of node locally, it is recommended to first install [node version manager (nvm)](https://github.com/nvm-sh/nvm) and then install the require version as following:

  ```bash
  NODE_VERSION=20.0.0
  nvm install $NODE_VERSION
  nvm alias default $NODE_VERSION
  nvm use default #to set this version of node as default in your environment
  nvm use #to set the node version based on the .nvmrc file
  ```

  > the above assumes you've installed nvm as described [here](https://github.com/nvm-sh/nvm), including [this step](https://github.com/nvm-sh/nvm#nvmrc).

- Install the node modules used in the project:

  ```bash
  npm install typescript
  ```

  All other dependencies are installed via `npm`

  ```bash
  npm install
  ```

## Configuration

Before running the application all required environment variables.

- If testing locally, variables can be added to an `.env` file

```bash
touch .env
```

- Set environment variables as following:
  
```bash
# OHIP gateway URL from OHIP dev portal environment
APIGW_URL=
# OHIP websocket gateway URL. Normally similar to API GW but with WS protocol
WS_URL=
# Endpoints
OAUTH_ENDPOINT=/oauth/v1/tokens
SUBS_ENDPOINT=/subscriptions
# OHIP dev portal app key
APP_KEY=
# SSD integration username/password
INTEGRATION_USER=
INTEGRATION_PASSWORD=
# OHIP dev portal environment credentials
CLIENT_ID=
CLIENT_SECRET=
# OAuth token expiry timeframe. Required to refresh token before it expires and connection is interrupted
TOKEN_EXPIRY=3540000
# Frequency to ping server
PING=10000
# Time to wait between re-connecting. Recommended 10000 ms (10 seconds)
TIMER=10000
# OPERA Cloud chain for the subscription. Can be obtained from the app subscription in dev portal
CHAIN=
# (Optional) Enter a property Id to filter events generated only in that property
# HOTELID=
# (Optional) Enter value if to stream events from a given offset. Default is 0 (meaning all prior events up to 7 days all wil be streamed)
# OFFSET=0
# (Optional) Enter true to omit old and new values which are similar. Default is false
# DELTA=true
# Log level options: silly, trace, debug, info, warn, error, fatal
LOGLEVEL=debug
# Set Stats. true or false. Default is false.
STATS=true
# Stat bucket: HOUR, MINUTE (default) or SECOND. If not set time bucket won't be displayed, only summary.
TIME_BUCKET=SECOND
# Run streaming client for following time before shutting it down
RUN_FOR=7080000
# Export events to events.json file
DUMP_TO_FILE=false
# If true converts key value pairs to explicit object e.g.  "elementName": "FIRST NAME" becomes first_name
SEGMENT_CONVERSION=true
# If true converts old value and new value into array for the element
# e.g. first_name: ['new value','old value']. If false, creates two elements first_name and first_name_was.
STACK_VALUES=true
# If set to true, events will be pushed to Kafka. Make sure to set host, credentials, topic and client id according to your environment
KAFKA_ENABLED=false
# KAFKA_HOST=
# KAFKA_USER=
# KAFKA_PASSWORD=
# KAFKA_TOPIC=ohip-events
# KAFKA_CLIENT_ID=gs-client
```

> To use an environment file other than `.env` set the environment variable `ENVPATH` to the relative path of the env file. E.g. `export ENVPATH=./dev.env`

## Run

Once all required environment variables have been set, project can be run by executing:

```bash
npm start
```

To run in development mode, execute

```bash
npm run dev
```

## License

This project and all content within is available under the [Universal Permissive License v 1.0](https://oss.oracle.com/licenses/upl).

See [LICENSE](LICENSE.txt) for more details.

## Disclaimer

This is NOT an official or supported project by Oracle. This project is intended solely for demonstration purposes and should be used at your own risk. No warranty or guarantee of reliability, accuracy, or completeness is provided. Any use of this project is solely at your own risk and we are not responsible for any losses or damages incurred.