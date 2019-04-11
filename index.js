require('dotenv').config();
const express = require('express');
const session = require('express-session');
var qbws = require('./qbws/qbws'); // my modified qbws
const mongoose = require('mongoose');
const api = require('./app/api');
const routes = require('./app/routes');
const webhooks = require('./app/webhooks');
const events = require('./app/events');
const cluster = require('cluster');
const MongoStore = require('connect-mongo')(session);
const numOfCPUs = require('os').cpus().length;

// if (cluster.isMaster) {
//   masterProcess();
// } else {
//   childProcess();
// }

// function masterProcess() {
//   console.log('Master ' + process.pid + ' is running.');
//   for (let i = 0; i < numOfCPUs; i++) {
//     console.log('Forking process number ' + i);
//     cluster.fork();
//   }

//   // set up the socket io on the master process for now

// }

childProcess();

function childProcess() {
  console.log('Worker ' + process.pid + ' started...');
  let app = express();
  app.locals.moment = require('moment');
  app.locals._ = require('lodash');
  app.set('view engine', 'pug');
  app.use(express.static('client'));
  app.use(express.json({limit: '150mb'}));
  app.use(express.urlencoded({extended: true, limit: '50mb'}));

  // prepare DB
  let uriString = process.env.MONGODB_URI || 
                  process.env.MONGOHQ_URL ||
                  'mongodb://localhost/db';

  mongoose.connect(uriString, { useNewUrlParser: true }).then(() => {
    console.log('Connected to database');
  }).catch(err => {
    console.log('Error connecting to database');
  });

  // Session setup
  let sessionMiddleware = session({
    store: new MongoStore({mongooseConnection: mongoose.connection}),
    secret: 'an apple a day',
    cookie: {
      maxAge: 7 * 60 * 60 * 1000
    },
    resave: false,
    saveUninitialized: true
  });
  app.use(sessionMiddleware);

  // TODO: clean up this
  app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
  app.use('/js', express.static(__dirname + '/node_modules/papaparse')); // redirect Papaparse
  app.use('/js', express.static(__dirname + '/node_modules/moment')); // redirect Moment
  app.use('/js', express.static(__dirname + '/node_modules/jsbarcode/dist')); // redirect JS Barcode

  let server = app.listen(process.env.PORT || 3000, function() {
    console.log('EC-Express running on port 3000');
    qbws.run(app);
  });

  // socket.io
  var io = require('socket.io')(server);
  api.setQBWS(qbws);
  events(io, qbws);
  app.use('/api', api.router);
  app.use('/webhooks', webhooks.router);
  routes(app);
  require('./app/schedule')(qbws);
}