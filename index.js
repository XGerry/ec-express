require('dotenv').config();
var express = require('express');
var cors = require('cors');
var qbws = require('./qbws/qbws'); // my modified qbws
var mongoose = require('mongoose');
var passport = require('passport');
var api = require('./app/api');
var routes = require('./app/routes');
var facebook = require('./app/facebook');
var events = require('./app/events');

var app = express();
app.set('view engine', 'pug');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, {
  useMongoClient: true,
  socketTimeoutMS: 360000,
  keepAlive: true
}, function (err, res) {
  if (err) {
    console.log('Error connecting to: ' + uriString + '. ' + err);
  } else {
    console.log('Successfully connected to: ' + uriString);
  }
});

// prepare server
app.use(cors({
  origin : 'https://www.ecstasycrafts.com',
  optionsSuccessStatus : 200
}));

app.use('/', express.static(__dirname + '/client'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

var server = app.listen(process.env.PORT || 3000, function() {
  console.log('EC-Express running on port 3000');
  qbws.run(app);
});

// socket.io
var io = require('socket.io')(server);

api.route(app, passport, qbws, io);
facebook.route(app);
events(io, qbws);
routes(app, passport);
require('./config/passport')(passport);
require('./app/schedule')(qbws);