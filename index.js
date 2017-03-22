var express = require('express');
var request = require('request');
var cors = require('cors');
var bodyParser = require('body-parser');

var app = express();
app.use(cors({
  origin : 'https://www.ecstasycrafts.com',
  optionsSuccessStatus : 200
}));

// application/json parser
var jsonParser = bodyParser.json();

app.get('/', function (req, res) {
  res.send('EC-Express');
});

app.listen(process.env.PORT || 3000, function() {
  console.log('EC-Express running on port 3000');
});

app.post('/contact', jsonParser, function (req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  console.log('Creating a new contact to send to Hubspot.');
  console.log('Firstname: ' + req.body.firstname);
  console.log('Lastname: ' + req.body.lastname);
  console.log('Email: ' + req.body.email);

  createContactHubspot(req.body);
  res.send('Sent request to hubspot.');
});

app.get('/create/contact', function (req, res) {
  var contact = {
    firstname : 'Matt',
    lastname : 'Oskamp',
    email : 'mattoskamp@gmail.com'
  };

  createContactHubspot(contact);
  res.send('Sent request to hubspot');
});

// helpers
function createContactHubspot(contact) {
  var options = {
    url : 'https://forms.hubspot.com/uploads/form/v2/2759836/26c3d878-3647-43ff-a3b7-642b59245fa1',
    form : contact
  };

  request.post(options, function (error, response) {
    if (error) {
      console.log(error);
    }
    console.log(response);
  });
}