var crypto = require('crypto');
var NodeRSA = require('node-rsa');
var request = require('request');
var builder = require('xmlbuilder');
var Item = require('./model/item');
var qs = require('qs');

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
  return signature;
}

function getAllFeedStatuses() {
	var baseURL = 'https://marketplace.walmartapis.com/v3/feeds';
	var httpMethod = 'GET';

	request(getRequestOptions(baseURL, httpMethod), function(err, response, body) {
		console.log(response.Status);
		console.log(body);
	});
}

function getFeedStatus(feedId) {
	var baseURL = 'https://marketplace.walmartapis.com/v3/feeds/' + encodeURIComponent(feedId);
	var method = 'GET';
	var query = {
		includeDetails: true
	};
	var options = getRequestOptions(baseURL, method, query);

	request(options, genericCallback);
}

function createItem(sku) {
	var findItem = Item.findOne({sku: sku});

	findItem.then(function(item) {
		var options = getRequestOptions('https://marketplace.walmartapis.com/v3/feeds?feedType=item', 'POST');
		options.body = getCreateItemFeed(item);
		options.headers['Content-Type'] = 'multipart/form-data; boundary=ecstasy123';
		
		request(options, genericCallback);
	});
}

function updateItem(sku) {
	var findItem = Item.findOne({sku: sku});
	findItem.then(function(item) {
		var options = getRequestOptions('https://marketplace.walmartapis.com/v3/feeds?feedType=item', 'POST');
		options.body = getUpdateItemFeed(item);
		options.headers['Content-Type'] = 'multipart/form-data; boundary=ecstasy123';
		request(options, genericCallback);
	});
}

function getItem(sku) {
	var options = getRequestOptions('https://marketplace.walmartapis.com/v3/items/'+sku, 'GET');
	options.headers.Accept = 'application/xml';

	request(options, genericCallback);
}

function getInventory(sku) {
	var findItem = Item.findOne({sku: sku});
	findItem.then(function(item) {
		var options = getRequestOptions('https://marketplace.walmartapis.com/v2/inventory', 'GET', {sku: item.sku});
		request(options, genericCallback);
	});
}

function updateInventory(sku) {
	var findItem = Item.findOne({sku: sku});
	findItem.then(function(item) {
		var options = getRequestOptions('https://marketplace.walmartapis.com/v2/inventory', 'PUT', {sku: item.sku});
		options.headers['Content-Type'] = 'application/xml';
		options.body = createInventoryItemDocument(item);

		request(options, genericCallback);
	});
}

function getRequestOptions(baseURL, httpMethod, query) {
	var date = new Date();
	var timestamp = date.getTime();

	var fullURL = baseURL;
	if (query) {
		fullURL = baseURL + '?' + qs.stringify(query);
	}

	var options = {
		url: baseURL,
		method: httpMethod,
		headers: {
			'WM_SVC.NAME': 'Walmart Marketplace',
			'WM_QOS.CORRELATION_ID': '123456abcdef',
			'WM_SEC.TIMESTAMP': timestamp,
			'WM_SEC.AUTH_SIGNATURE': generateSignature(fullURL, httpMethod, timestamp),
			'WM_CONSUMER.CHANNEL.TYPE': process.env.WM_CONSUMER_CHANNEL,
			'WM_CONSUMER.ID': process.env.WM_CONSUMER_ID,
			'Host': 'marketplace.walmartapis.com',
			'Accept': 'application/json'
		}
	};

	if (query) {
		options.qs = query;
	}

	console.log(fullURL);
	return options;
}

function createInventoryItemDocument(item) {
	var feed = {
		inventory: {
			'@xmlns': 'http://walmart.com/',
			sku: item.sku,
			quantity: {
				unit: 'EACH',
				amount: 2 // default for now
			},
			fulfillmentLagTime: 3
		}
	};

	var xmlDoc = builder.create(feed, {encoding: 'utf-8'});
	var str = xmlDoc.end({pretty: true});
	console.log(str);
	return str;
}

function getUpdateItemFeed(item) {
	var feed = getMPItemFeed(item);
	feed.MPItemFeed.MPItem = getMPItem(item, 'REPLACE_ALL');
	feed.MPItemFeed.MPItem.MPProduct = getMPProduct(item);
	feed.MPItemFeed.MPItem.MPOffer = getMPOffer(item);

	return capFeed(feed);
}

function getCreateItemFeed(item) {
	var feed = getMPItemFeed(item);
	feed.MPItemFeed.MPItem = getMPItem(item, 'CREATE');
	feed.MPItemFeed.MPItem.MPProduct = getMPProduct(item);
	feed.MPItemFeed.MPItem.MPOffer = getMPOffer(item);

	return capFeed(feed);
}

function getMPItemFeed(item) {
	var expiry = new Date();
	expiry.setDate(expiry.getDate() + 7);
	var expiryString = expiry.toISOString();
	
	var feed = {
		MPItemFeed: {
			'@xmlns': 'http://walmart.com/',
			MPItemFeedHeader: {
				version: '3.1',
				requestId: 'EC_REQUEST',
				requestBatchId: 'EC_REQUEST_BATCH',
				feedDate: expiryString,
				mart: 'WALMART_US'
			}
		}
	};

	return feed;
}

function getMPItem(item, processMode) {
	var productIdType = 'UPC';
	if (item.barcode.length == 13) {
		productIdType = 'EAN';
	}

	var mpItem = {
		processMode: processMode,
		sku: item.sku,
		productIdentifiers: {
			productIdentifier: {
				productIdType: productIdType,
				productId: item.barcode
			}
		}
	};

	return mpItem;
}

function getMPProduct(item) {
	var mpProduct = {
		productName: item.name,
		category: {
			ArtAndCraftCategory: {
				ArtAndCraft: {
					shortDescription: item.name,
					brand: item.manufacturerName,
					manufacturer: item.manufacturerName,
					mainImageUrl: 'https://www.ecstasycrafts.com'+item.imageURL
				}
			}
		}
	};

	return mpProduct;
}

function getMPOffer(item) {
	var mpOffer = {
		price: item.usPrice,
		ShippingWeight: {
			measure: item.weight,
			unit: 'lb'
		},
		ProductTaxCode: '2038711',
		ShippingOverrides: {
			shippingOverride: [{
				ShippingOverrideIsShippingAllowed: 'No',
				ShippingOverrideShipMethod: 'VALUE',
				ShippingOverrideShipRegion: 'STREET_48_STATES',
				ShippingOverrideshipPrice: 4.00
			}, {
				ShippingOverrideIsShippingAllowed: 'Yes',
				ShippingOverrideShipMethod: 'STANDARD',
				ShippingOverrideShipRegion: 'STREET_48_STATES',
				ShippingOverrideshipPrice: 4
			}]
		}
	};

	return mpOffer;
}

function capFeed(feed) {
	var xmlDoc = builder.create(feed, {encoding: 'utf-8'});
	var str = xmlDoc.end({pretty: true});
	//str = str.substring(str.indexOf("\n") + 1);
	str = '--ecstasy123\n\n'+str+'\n\n--ecstasy123--'; // you have to do this!
	console.log(str);
	return str;
}

function genericCallback(err, response, body) {
	console.log(body);
}

module.exports = {
	getAllFeedStatuses: getAllFeedStatuses,
	createItem: createItem,
	getFeedStatus: getFeedStatus,
	getInventory: getInventory,
	getItem: getItem,
	updateInventory: updateInventory,
	updateItem: updateItem
};