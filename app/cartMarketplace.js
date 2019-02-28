const rp = require('request-promise-native');

function Marketplace(secureUrl, privateKey, token) {
	this.secureUrl = secureUrl;
	this.privateKey = privateKey;
	this.token = token;
}

Marketplace.prototype.getOptions = function(url, method) {
	let options = {
		url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/' + url,
		method: method,
		headers: {
			SecureUrl: this.secureUrl,
			PrivateKey: this.privateKey,
			Token: this.token
		},
		json: true
	};
	return options;
}

Marketplace.prototype.get = function(url, qs) {
	let options = this.getOptions(url, 'get');
	options.qs = qs;
	return rp(options);
}

Marketplace.prototype.post = function(url, body) {
	let options = this.getOptions(url, 'post');
	options.body = body;
	return rp(options);
}

Marketplace.prototype.put = function(url, body) {
	let options = this.getOptions(url, 'put');
	options.body = body;
	return rp(options);
}

Marketplace.prototype.getItems = async function() {
	let totalCount = await this.get('Products', {
		countonly: 1
	});

	totalCount = totalCount.TotalCount;
	let numberOfRequests = Math.ceil(totalCount / 200);

	console.log('Found ' + totalCount + ' number of items.');

	console.log('Performing ' + numberOfRequests + ' number of requests.');

	let allItems = [];
	for (let i = 0; i < numberOfRequests; i++) {
		console.log('Starting request ' + (i + 1));
		let items = await this.get('Products', {
			limit: 200,
			offset: i * 200
		});
		allItems = allItems.concat(items);
		console.log('done.');
	}

	return allItems;
}

Marketplace.prototype.getPromotions = async function() {
	await this.get('Promotions');
}

module.exports = Marketplace;