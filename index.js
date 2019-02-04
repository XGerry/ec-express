require('dotenv').config();
const express = require('express');
const session = require('express-session');
var qbws = require('./qbws/qbws'); // my modified qbws
const mongoose = require('mongoose');
const api = require('./app/api');
const routes = require('./app/routes');
const webhooks = require('./app/webhooks');
const events = require('./app/events');

var app = express();
app.locals.moment = require('moment');
app.locals._ = require('lodash');
app.set('view engine', 'pug');
app.use(express.static('client'));
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// Session setup
let sessionMiddleware = session({
  secret: 'an apple a day',
  cookie: {
    maxAge: 7 * 60 * 60 * 1000
  },
  resave: false,
  saveUninitialized: true
});
app.use(sessionMiddleware);

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, { useNewUrlParser: true }).then(() => {
  console.log('Connected to database');
}).catch(err => {
  console.log('Error connecting to database');
});

// TODO: clean up this
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/js', express.static(__dirname + '/node_modules/papaparse')); // redirect Papaparse
app.use('/js', express.static(__dirname + '/node_modules/moment')); // redirect Moment
app.use('/js', express.static(__dirname + '/node_modules/jsbarcode/dist')); // redirect JS Barcode


var server = app.listen(process.env.PORT || 3000, function() {
  console.log('EC-Express running on port 3000');
  qbws.run(app);
});

// socket.io
var io = require('socket.io')(server);

events(io, qbws);
app.use('/api', require('./app/api.js').router);
routes(app);
webhooks.route(app, qbws);
require('./app/schedule')(qbws);