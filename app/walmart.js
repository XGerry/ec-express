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
	var findItem = Item.find({sku: sku});

	findItem.then(function(item) {
		createItemRequest(item)
	});
}

function createItemRequest(items) {
	var options = getRequestOptions('https://marketplace.walmartapis.com/v3/feeds?feedType=item', 'POST');
	options.body = getCreateItemFeed(items);
	options.headers['Content-Type'] = 'multipart/form-data; boundary=ecstasy123';
	request(options, genericCallback);
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

function updateInventoryItem(sku) {
	var findItem = Item.findOne({sku: sku});
	findItem.then(function(item) {
		createInventoryRequest([item]);
	});
}

function updateInventory() {
	var findItems = Item.find({updated: true});
	findItems.then(function(items) {
		createInventoryRequest(items);
	});
}

function updateAllInventory() {
	var findAllItems = Item.find({});
	var savingItems = [];
	findAllItems.then(function(items) {
		items.forEach(function(item) {
			if (item.stock > 30) {
				item.walmartStock = 2;
				savingItems.push(item.save());
			}
		});
	});
	
	Promise.all(savingItems).then(function(results) {
		findAllItems.then(function(items) {
			createInventoryRequest(items);
		});
	});
}

function createInventoryRequest(items) {
	var options = getRequestOptions('https://marketplace.walmartapis.com/v2/feeds?feedType=inventory', 'POST');
	options.headers['Content-Type'] = 'multipart/form-data; boundary=ecstasy123';
	options.body = getCreateInventoryFeed(items);
	request(options, genericCallback);
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

function getCreateInventoryFeed(items) {
	var feed = getInventoryFeed();
	feed.InventoryFeed.inventory = [];
	items.forEach(function(item) {
		feed.InventoryFeed.inventory.push(getInventoryItem(item));
	});

	return capFeed(feed);
}

function getUpdateItemFeed(item) {
	var feed = getMPItemFeed(item);
	feed.MPItemFeed.MPItem = getMPItem(item, 'REPLACE_ALL');
	feed.MPItemFeed.MPItem.MPProduct = getMPProduct(item);
	feed.MPItemFeed.MPItem.MPOffer = getMPOffer(item);

	return capFeed(feed);
}

function getCreateItemFeed(items) {
	var feed = getMPItemFeed();

	var mpItems = [];
	items.forEach(function(item) {
		console.log(item.sku);
		if (item.barcode) {
			var mpItem = getMPItem(item, 'CREATE');
			mpItem.MPProduct = getMPProduct(item);
			mpItem.MPOffer = getMPOffer(item);
			mpItems.push(mpItem);
		} else {
			console.log('No barcode for item: ' + item.sku);
		}
	});

	feed.MPItemFeed.MPItem = mpItems;
	return capFeed(feed);
}

function getInventoryFeed() {
	var feed = {
		InventoryFeed: {
			'@xmlns': 'http://walmart.com/',
			InventoryHeader: {
				version: '1.4'
			}
		}
	};
	return feed;
}

function getInventoryItem(item) {
	var feed = {
		sku: item.sku,
		quantity: {
			unit: 'EACH',
			amount: item.walmartStock
		},
		fulfillmentLagTime: 3
	};

	return feed;
}

function getMPItemFeed() {
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
	var barcode = item.barcode.replace(/a| /gi, '');
	var productIdType = 'UPC';
	if (barcode.length == 13) {
		productIdType = 'EAN';
	}

	var mpItem = {
		processMode: processMode,
		sku: item.sku,
		productIdentifiers: {
			productIdentifier: {
				productIdType: productIdType,
				productId: barcode
			}
		}
	};

	return mpItem;
}

function getMPProduct(item) {
	console.log('MP Product for ' + item.sku);
	var imageURL = item.imageURL;
	if (imageURL[0] != '/') {
		imageURL = '/'+imageURL;
	}
	var mpProduct = {
		productName: item.name,
		category: {
			ArtAndCraftCategory: {
				ArtAndCraft: {
					shortDescription: item.name,
					brand: item.manufacturerName,
					manufacturer: item.manufacturerName,
					mainImageUrl: 'https://www.ecstasycrafts.com' + imageURL
				}
			}
		}
	};

	return mpProduct;
}

function getMPOffer(item) {
	console.log('MPOffer for ' + item.sku);
	var walmartPrice = item.usPrice + 1; // add a dollar to the price
	walmartPrice = walmartPrice.toFixed(2);
	var mpOffer = {
		price: walmartPrice,
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

function bulkCreateItems(manufacturerName) {
	var findItems = Item.find({manufacturerName: manufacturerName}).limit(100);

	findItems.then(function(items) {
		console.log('found ' + items.length + ' items');
		createItemRequest(items);
	});
}

function bulkSendItems(items) {
	createItemRequest(items);
}

function calculateWalmartInventory() {
	var findAllItems = Item.find({});
	findAllItems.then(function(items) {
		items.forEach(function(item) {
			if (item.stock > 30) {
				item.walmartStock = 2;
				item.save();
			}
		});
	});
}

module.exports = {
	getAllFeedStatuses: getAllFeedStatuses,
	createItem: createItem,
	getFeedStatus: getFeedStatus,
	getInventory: getInventory,
	getItem: getItem,
	updateInventory: updateInventory,
	updateInventoryItem: updateInventoryItem,
	updateAllInventory: updateAllInventory,
	updateItem: updateItem,
	bulkCreateItems: bulkCreateItems,
	bulkSendItems: bulkSendItems
};