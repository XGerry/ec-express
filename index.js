var express = require('express');
var cors = require('cors');
var qbws = require('./qbws/qbws'); // my modified qbws
var mongoose = require('mongoose');
var session = require('express-session');
var passport = require('passport');
var flash = require('connect-flash');
var routes = require('./app/routes');

var app = express();
app.set('view engine', 'pug');

// prepare DB
var uriString = process.env.MONGODB_URI || 
                process.env.MONGOHQ_URL ||
                'mongodb://localhost/db';

mongoose.connect(uriString, function (err, res) {
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

// passport config
app.use(session({
  secret : 'applefallscider',
  resave : false,
  saveUninitialized : false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.listen(process.env.PORT || 3000, function() {
  console.log('EC-Express running on port 3000');
  qbws.run(app);
});

routes.route(app, passport, qbws);
require('./config/passport')(passport);
require('./app/schedule')(qbws);