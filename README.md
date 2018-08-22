# Yugastore

This is a sample, end-to-end functional bookstore (or more generally, an e-commerce app) built using YugaByte DB. This app show how YugaByte-DB makes this development very simple by providing a Redis API, as well as a traditional tables/rows/structured query-language based API.

The app is continuously being improved. It currently features:
- products catalog listing
- product details page
- static product grouping (such as "business books", "mystery books", etc)
- dynamic product grouping (such as "most reviewed", "highest rated", etc)
- tracking for pageviews (both counts and referral for firther analysis)
- Coming soon: a shopping cart, online checkout, order history tracking.

![YugaStore](https://raw.githubusercontent.com/YugaByte/yugastore/master/screenshots/yugastore-screenshot.png)

This app is built using the following stack:
* Frontend: ReactJS
* Backend: Express and NodeJS
* Database: YugaByte DB

# Understanding the app

Review the design of the app in [YugaByte DB Docs](https://docs.yugabyte.com/develop/realworld-apps/ecommerce-app/).

# Running the sample app

## Run on Pivotal Cloud Foundry

Pre-requesities:
- YugaByte DB installed on PKS
- YugaByte Cassandra and Redis API endpoints

1. Clone the git repo

```
git clone https://github.com/Pivotal-Field-Engineering/yugastore-cf-app
```

2. Update config.json with Cassandra and Redis endpoints 

```
{
"DB_HOST_CASSANDRA": "",
"DB_HOST_REDIS": "=",
"APP_HOST": "localhost",
"APP_PORT": "3001"
}

```

2. Build the NodeJS app. Run the below commands from Project folder 
```
npm install

node models/yugabyte/db_init.js

cd ui/

npm install

npm run build

```
3. push the app onto Pivotal Cloud Foundry

```
cf push 
```

4. Viewing the UI

```
http://yugastore.cfapps.haas-107.pez.pivotal.io
```

