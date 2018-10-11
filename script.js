require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, {
  useMongoClient: true,
  socketTimeoutMS: 0,
  autoReconnect: true,
  keepAlive: true
}, function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    var promises = [];
    Order.find({}).then(orders => {
      orders.forEach(order => {
        promises.push(order.updateDueDate());
      });
    });
    Promise.all(promises).then(() => {
      console.log('Done');
    });
  }
});


