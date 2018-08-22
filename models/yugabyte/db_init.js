const cassandra = require('cassandra-driver');
const redis = require("redis")
const async = require('async');
const assert = require('assert');

var sample_data = require("../sample_data.json");
console.log("Parsed %d product items.", sample_data.products.length);

var fs = require('fs'),
configPath = './config.json';
var options = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
DB_HOST_CASSANDRA=options.DB_HOST_CASSANDRA
DB_HOST_REDIS=options.DB_HOST_REDIS
console.log("DB host CASSANDRA: " + options.DB_HOST_CASSANDRA);
console.log("DB host REDIS: " + options.DB_HOST_REDIS);
//
// Create a YugaByte client for Cassandra and Redis APIs.
//
const ybRedisClient = redis.createClient({host: DB_HOST_REDIS});
const ybCassandraClient = new cassandra.Client({ contactPoints: [DB_HOST_CASSANDRA] });

ybCassandraClient.connect().then(function(){
  console.log("Connected to cluster.");
  createKeyspace();
}).catch(function(err){
  console.log(err);
});

//
// Create the keyspace.
//
function createKeyspace() {
  ybCassandraClient.execute('CREATE KEYSPACE IF NOT EXISTS yugastore;').then(function(result){
    console.log('Successfully created keyspace yugastore.');
    createProductsTable();
  }).catch(function(err){
    console.log("error" + err);
  })
}

//
// Create the tables.
//
function createProductsTable() {
  const create_table =
    'CREATE TABLE IF NOT EXISTS yugastore.products (' +
    '  id int PRIMARY KEY, ' +
    '  name TEXT, ' +
    '  description TEXT, ' +
    '  price DOUBLE, ' +
    '  author TEXT, ' +
    '  type TEXT, ' +
    '  img TEXT, ' +
    '  category TEXT, ' +
    '  num_reviews INT, ' +
    '  total_stars INT' +
    ');'
  ybCassandraClient.execute(create_table, function (err, result) {
    if (err) {
      console.log(err);
      return;
    }
    console.log('Successfully created table yugastore.products.');
    loadProducts();
  });
}

//
// Load the sample product data, as well as reviews for the product. Here we are only inserting review
// metadata (such as number of reviews written and total ratings, so we can find the average rating across
// all reviews).
//
// Some considerations: 
//   NOTE #1: We will keep total reviews across products as a Redis sorted set in order to answer query the
//            most reviewed product, the highest rated product, etc.
//   NOTE #2: Ideally, review metadata should be stored in a separate Redis table. For now we are putting it
//            into the same products table to keep things simple. 
//
function loadProducts() {
  const insert = "INSERT INTO yugastore.products " +
                 "  (id, name, description, price, author, type, img, category, num_reviews, total_stars)" +
                 " VALUES" +
                 "  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);"
  // Prepare a batch insert.
  var insert_batch = [];
  var review_metadata = [];
  for (var i = 0; i < sample_data.products.length; i++) {
    var p = sample_data.products[i];

    // The number of reviews written for this item will be a random number between 1 and 1000.
    var numReviews = Math.floor(Math.random() * 1000) + 1;
    // Give this item between 3 and 5 stars for each of the reviews above.
    var totalStars = Math.floor(Math.random() * 2 * numReviews) + 3 * numReviews;
    var avgStars = totalStars / numReviews
    var params =
      [p.id, p.name, p.description, p.price, p.author, p.type, p.img, p.category, numReviews, totalStars];
    review_metadata.push({"id": p.id, "num_reviews": numReviews, "num_stars": avgStars.toFixed(2)});

    insert_batch.push({
      query: insert,
      params: params
    });
  }
  // Prepare and insert the batch.
  ybCassandraClient.batch(insert_batch, { prepare: true }, function(err) {
     assert.ifError(err);
     console.log('Inserted %d rows into table yugastore.products.', insert_batch.length);
     loadReviews(review_metadata);
  });
}

//
// For each of the products load the reviews, as well as some views/buys stats.
//
function loadReviews(review_metadata) {
  deleteExistingReviews().then(function(){
    loadNewReviews(review_metadata).then(function(){
      teardown();
    });
  });
}

function deleteExistingReviews() {
  // Delete all existing keys.
  ybRedisClient.del("allproducts:num_reviews");
  ybRedisClient.del("allproducts:num_stars");
  ybRedisClient.del("allproducts:num_buys");
  ybRedisClient.del("allproducts:num_views");
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({rows: []});
    }, 20);
  });
}

function loadNewReviews(review_metadata) {
  for (var i = 0; i < review_metadata.length; i++) {
    var e = review_metadata[i];
    var numBuys = Math.floor(Math.random() * 100);
    var numViews = Math.floor(Math.random() * 9000) + 1000;
    ybRedisClient.zadd("allproducts:num_reviews", e.num_reviews, e.id);
    ybRedisClient.zadd("allproducts:num_stars", e.num_stars, e.id);
    ybRedisClient.zadd("allproducts:num_buys", numBuys, e.id);
    ybRedisClient.zadd("allproducts:num_views", numViews, e.id);
    if (i === review_metadata.length - 1) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({rows: []});
        }, 60);
      });
    }
  }

}

//
// Close the client.
//
function teardown() {
  console.log('Shutting down YugaByte client connection for Cassandra API.');
  ybCassandraClient.shutdown();

  ybRedisClient.quit(function (err, res) {
    console.log('Shutting down YugaByte client connection for Redis API.');
  });
}
