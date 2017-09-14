var helpers = require('./helpers');
var Item = require('./model/item');
var crypto = require('crypto');
var queryString = require('query-string');
var request = require('request');

function addProducts(callback) {
	var options = {
    url: 'https://mws.amazonservices.com/',
    qs: {
      AWSAccessKeyId: process.env.AWS_ACCESS_KEY,
      Action: 'SubmitFeed',
      ContentMD5Value: '',
      FeedType: '_POST_PRODUCT_DATA_',
      Merchant: 'A1AG76L8PLY85T',
      PurgeAndReplace: false,
      SignatureMethod: 'HmacSHA256',
      SignatureVersion: '2',
      Timestamp: '',
      Version: '2009-01-01',
    },
    headers: {
      'Content-Type': 'text/xml'
    }
  };

  var xmlDoc = {
    AmazonEnvelope : {
      Header: {
        DocumentVersion: 1.01,
        MerchantIdentifier: 'M_ECSTASYCRA_1118417'
      },
      MessageType: 'Product',
      PurgeAndReplace: 'false'
    }
  };

  var messages = [];
  var messageCounter = 0;

  Item.find({sku: 'DUS0649'}, function(err, items) {
  	items.forEach(function(item) {
  		if (item.barcode) {
	  		var message = {
	  			MessageID: ++messageCounter,
	  			Product: {
	  				SKU: item.sku,
	  				StandardProductID: {
	  					Type: 'UPC',
	  					Value: item.barcode
	  				}
	  			}
	  		}
	  		messages.push(message);
  		} else {
  			console.log(item.sku + ' had no barcode');
  		}
  	});

	  xmlDoc.AmazonEnvelope.Message = messages;

		var body = helpers.getXMLDoc(xmlDoc);
		console.log(body);
	  options.body = body;
	  var now = new Date();
	  options.qs.Timestamp = now.toISOString();
	  options.qs.ContentMD5Value = crypto.createHash('md5').update(body).digest('base64');

	  var qString = queryString.stringify(options.qs);
	  
	  var stringToSign = 'POST\n' + 
	    'mws.amazonservices.com\n' +
	    '/\n' +
	    qString;

	  options.qs.Signature = crypto.createHmac('sha256', process.env.AMAZON_SECRET_KEY)
	    .update(stringToSign)
	    .digest('base64');

	  request.post(options, function(err, response, body) {
	  	console.log(body);
	    callback(body);
	  });
	});
}

module.exports = {
	addProducts: addProducts
}