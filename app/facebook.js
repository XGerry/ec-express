var Item = require('./model/item');
var fs = require('fs');

module.exports = {
	routes: function(app) {
		app.get('/feeds/facebook/us', function(req, res) {
			// generate the feeds file for facebook
		});
	},
	generateFacebookFeed: generateFacebookFeed
}

function generateFacebookFeed(callback) {
	Item.find({}, function(err, items) {
		if (err) {
			console.log(err);
		} else {
			var headers = 'id\tavailability\tcondition\tdescription\timage_link\tlink\ttitle\tprice\tgtin';
			var feed = '';
			feed += headers+'\n';
			items.forEach(function(item) {
				if (item.barcode != undefined && item.barcode != '') {
					var line = '';
					line = addCol(line, item.sku);
					if (item.stock > 0) {
						line = addCol(line, 'in stock');
					} else if (item.inactive) {
						line = addCol(line, 'out of stock');
					} else {
						line = addCol(line, 'available for order');
					}
					line = addCol(line, 'new');
					if (item.description) {
						var cleanDescription = item.description.replace(/<br[^>]*>/gi, ' ');
						line = addCol(line, cleanDescription);
					} else {
						line = addCol(line, item.name);
					}
					line = addCol(line, 'https://www.ecstasycrafts.com/'+item.imageURL);
					line = addCol(line, item.usLink+','+item.canLink);
					line = addCol(line, item.name);
					line = addCol(line, item.usPrice.toFixed(2) + ' USD');
					line += item.barcode.replace(/a/gi, '');
					feed = addRow(feed, line);
				}
			});

			fs.writeFile('facebook_us.tsv', feed, function(err) {
				if (err) {
					console.log(err);
				} else {
					console.log('Feed Generated Successfully');
				}
				callback(err);
			});
		}
	});
}

function addCol(line, value) {
	line += value + '\t';
	return line;
}

function addRow(csv, line) {
	csv += line + '\n';
	return csv;
}