var express = require('express');
var router = express.Router();

var _=require('underscore');

const redis = require("redis")
const yugabyte = require('cassandra-driver');

var fs = require('fs'),
configPath = './config.json';
var options = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
DB_HOST_CASSANDRA=options.DB_HOST_CASSANDRA
DB_HOST_REDIS=options.DB_HOST_REDIS
console.log("DB host CASSANDRA: " + options.DB_HOST_CASSANDRA);
console.log("DB host REDIS: " + options.DB_HOST_REDIS);

const ybRedis = redis.createClient({host: DB_HOST_REDIS});
const ybCassandra =
  new yugabyte.Client({ contactPoints: [DB_HOST_CASSANDRA],
                        keyspace: 'yugastore'
                      });
ybCassandra.connect(function (err) {
  if(err) {
    console.log(err);
  }
});

/* List all products. */
router.get('/', function(req, res, next) {
  productListing = [];
  ybCassandra.execute('SELECT * FROM yugastore.products;')
             .then(result => {
                const row = result.first();
                for (var i = 0; i < result.rows.length; i++) {
                  var avgStars = result.rows[i].total_stars / result.rows[i].num_reviews;
                  result.rows[i].stars = avgStars.toFixed(2);
                  productListing.push(result.rows[i]); 
                }
                return res.json(productListing);
             });
});

/* List products by a sort category. */
router.get('/sort/:sortorder', function(req, res, next) {
  var key = 'allproducts:' + req.params.sortorder;
  console.log(key);
  ybRedis.zrevrange(key, 0, 10, 'withscores', function(err, members) {
      // the resulting members would be something like
      // ['id1', '<score-1>', 'id2', '<score-2>', 'id3', 'score-3']
      // use the following trick to convert to
      // [ [ 'id1', '<score-1>' ], [ 'id2', '<score-2>' ], [ 'id3', '<score-3>' ] ]
      // learned the trick from
      // http://stackoverflow.com/questions/8566667/split-javascript-array-in-chunks-using-underscore-js
      var lists=_.groupBy(members, function(a,b) {
          return Math.floor(b/2);
      });

      // Collect all the product ids.
      product_ids = [];
      for (var i = 0; entry = lists[i]; i++) {
        product_ids.push(entry[0]);
      }

      // Fetch details for all the product ids.
      productListing = [];
      var selectStmt = 'SELECT * FROM yugastore.products WHERE id IN ?;';
      ybCassandra.execute(selectStmt, [product_ids], { prepare: true })
                  .then(result => {
                    var productsMap = {};
                    for (var i = 0; i < result.rows.length; i++) {
                      var avgStars = result.rows[i].total_stars / result.rows[i].num_reviews;
                      result.rows[i].stars = avgStars.toFixed(2);
                      productsMap[result.rows[i].id] = result.rows[i];
                       
                    }
                    // Sort the product ids in descending order.
                    for (var i = 0; i < product_ids.length; i++) {
                      productListing.push(productsMap[product_ids[i]]);
                    }
                    return res.json(productListing);
                  });
  });
});

/* List products in a specific category. */
router.get('/category/:category', function(req, res, next) {
  productListing = [];
  var selectStmt = 'SELECT * FROM yugastore.products WHERE category=?;';
  ybCassandra.execute(selectStmt, [req.params.category])
              .then(result => {
                const row = result.first();
                for (var i = 0; i < result.rows.length; i++) {
                  var avgStars = result.rows[i].total_stars / result.rows[i].num_reviews;
                  result.rows[i].stars = avgStars.toFixed(2);
                  productListing.push(result.rows[i]); 
                }
                return res.json(productListing);
              });
});

/* Return details of a specific product id. */
router.get('/details/:id', function(req, res, next) {
  var redisKeyPrefix = 'pageviews:product:' + req.params.id + ':';

  // Increment the num pageviews for the product.
  ybRedis.incrby(redisKeyPrefix + "count", 1);
  console.log("Responding for id: " + req.params.id);

  // Track the history of pageviews for the product.
  var payload = "{ userid: '12345', referral_source: 'google', referral_url: 'xyz' }"
  var d = new Date();
  var timestamp = Math.round(d.getTime() / 1000);
  ybRedis.zadd(redisKeyPrefix + "history", timestamp, payload);

  // Return the product details.
  var productDetails = {}
  var selectStmt = 'SELECT * FROM yugastore.products WHERE id=' + req.params.id + ';';
  ybCassandra.execute(selectStmt)
              .then(result => {
                var row = result.first();
                var avgStars = row.total_stars / row.num_reviews;
                row.stars = avgStars.toFixed(2);                
                productDetails = Object.assign({}, row);
                return res.json(productDetails);
              });
});


module.exports = router;
