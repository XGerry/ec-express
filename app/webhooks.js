var request = require('request');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({limit : '50mb'});

module.exports = {
	route: function(app) {
		app.post('/webhooks/new-order', jsonParser, function(req, res) {
			console.log(req.body);
			res.send('Got it');
		});
	}
}