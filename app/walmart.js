var crypto = require('crypto');
var NodeRSA = require('node-rsa');
var request = require('request');
var builder = require('xmlbuilder');
var Item = require('./model/item');

function generateSignature(fullURL, httpMethod, timestamp) {
	var stringToSign = process.env.WM_CONSUMER_ID + '\n' +
		fullURL + '\n' +
		httpMethod + '\n' +
		timestamp + '\n';

	var signedString = signData(stringToSign);
	return signedString;
}

function signData(stringToSign) {
	var bytes = Buffer.from(process.env.WM_PRIVATE_KEY, 'base64');
	var key = new NodeRSA();
	key.importKey(bytes, 'pkcs8-private-der');
	var privateKey = key.exportKey();

	var signature = new NodeRSA(privateKey, {signingScheme: 'sha256'}).sign(stringToSign).toString('base64');
	console.log('Signature:');
	console.log(signature);
  return signature;
}

function getAllFeedStatuses(callback) {
	var baseURL = 'https://marketplace.walmartapis.com/v3/feeds';
	var httpMethod = 'GET';

	request(getRequestOptions(baseURL, httpMethod), function(err, response, body) {
		console.log(response.Status);
		console.log(body);
	});
}

function createItem(callback) {
	var findItem = Item.findOne({sku: 'CR1424'});

	findItem.then(function(item) {
		var options = getRequestOptions('https://marketplace.walmartapis.com/v3/feeds?feedType=item', 'POST');
		options.body = createItemFeed(item);
		options.headers.Host = 'marketplace.walmartapis.com';
		options.headers['Content-Type'] = 'multipart/form-data; boundary=ecstasy123';
		request(options, function(err, response, body) {
			console.log(err);
			console.log(body);
		});
	});
}

function getRequestOptions(baseURL, httpMethod, query) {
	var date = new Date();
	var timestamp = date.getTime();

	var options = {
		url: baseURL,
		method: httpMethod,
		headers: {
			'WM_SVC.NAME': 'Walmart Marketplace',
			'WM_QOS.CORRELATION_ID': '123456abcdef',
			'WM_SEC.TIMESTAMP': timestamp,
			'WM_SEC.AUTH_SIGNATURE': generateSignature(baseURL, httpMethod, timestamp),
			'WM_CONSUMER.CHANNEL.TYPE': process.env.WM_CONSUMER_CHANNEL,
			'WM_CONSUMER.ID': process.env.WM_CONSUMER_ID,
			'Accept': 'application/json'
		}
	};

	if (query) {
		options.qs = query;
	}

	return options;
}

function createItemFeed(item) {
	var feed = {
		MPItemFeed: {
			MPItem: {
				sku: item.sku,
				productIdentifiers: {
					productIdType: 'UPC',
					productId: item.barcode
				}
			},
			MPOffer: {
				price: item.usPrice,
				ShippingWeight: {
					measure: item.weight,
					unit: 'lb'
				},
				ProductTaxCode: '2038711'
			}
		}
	}

	var xmlDoc = builder.create(feed);
	var str = xmlDoc.end({pretty: true});
	str = '--ecstasy123\n\n'+str+'\n\n--ecstasy123--'; // you have to do this!
	console.log(str);
	return str;
}

module.exports = {
	getAllFeedStatuses: getAllFeedStatuses,
	createItem: createItem
}