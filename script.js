require('dotenv').config();
var mongoose = require('mongoose');
var Order = require('./app/model/order');
var Batch = require('./app/model/batch');
var Customer = require('./app/model/customer');
var Item = require('./app/model/item');
const chalk = require('chalk');
const shortid = require('shortid');
const moment = require('moment');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, {
  useNewUrlParser: true
}, async function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    let updatedOptions = await Item.find({updated: true, isOption: true});
    console.log('found ' + updatedOptions.length);
    for (option of updatedOptions) {
      let response = await option.refreshFrom3DCart();
    }
    console.log('done refreshing the options');
  }
});