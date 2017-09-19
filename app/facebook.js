var Item = require('./model/item');
var fs = require('fs');
var path = require('path');

module.exports = {
	route: function(app) {
		app.get('/feeds/facebook/us', function(req, res) {
			// generate the feeds file for facebook
			generateFacebookFeed(function(err) {
				if (err) {
					res.send('Error generating feed.');
				} else {
					res.sendFile(path.resolve(__dirname + '/../feeds/facebook_us.tsv'));
				}
			});
		});
	},
	generateFacebookFeed: generateFacebookFeed
}

function generateFacebookFeed(callback) {
	Item.find({}, function(err, items) {
		if (err) {
			console.log(err);
		} else {
			var headers = 'id\tavailability\tcondition\tdescription\timage_link\tlink\ttitle\tprice\tgtin\tmpn\titem_group_id';
			var feed = '';
			feed += headers+'\n';
			items.forEach(function(item) {
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
					var cleanDescription = cleanDescription.replace(/(&nbsp;|<([^>]+)>)/gi, ' ');
					line = addCol(line, cleanDescription);
				} else {
					line = addCol(line, item.name);
				}
				line = addCol(line, 'https://www.ecstasycrafts.com/'+item.imageURL);
				line = addCol(line, item.usLink+','+item.canLink);
				line = addCol(line, item.name);
				line = addCol(line, item.usPrice.toFixed(2) + ' USD');
				if (item.barcode) {
					var barcode = item.barcode.replace(/a/gi, '');
					line = addCol(line, barcode);
					line = addCol(line, ''); // no mpn
				} else {
					line = addCol(line, ''); // no barcode
					line = addCol(line, item.sku);
				}
				if (item.isOption) {
					line += item.catalogId + '\t'; // add the parent to the group Id
				} else {
					line += '\t';
				}
				feed = addRow(feed, line);
			});

			fs.writeFile('./feeds/facebook_us.tsv', feed, function(err) {
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