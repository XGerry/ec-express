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

Marketplace.prototype.getAll = async function(route) {
	let totalCount = await this.get(route, {
		countonly: 1
	});

	totalCount = totalCount.TotalCount;
	let numberOfRequests = Math.ceil(totalCount / 200);

	console.log('Found ' + totalCount + ' number of objects from .' + route);
	console.log('Performing ' + numberOfRequests + ' number of requests.');

	let allObjects = [];
	for (let i = 0; i < numberOfRequests; i++) {
		console.log('Starting request ' + (i + 1));
		let items = await this.get(route, {
			limit: 200,
			offset: i * 200
		});
		allObjects = allObjects.concat(items);
		console.log('done.');
	}

	return allObjects;
}

Marketplace.prototype.getItems = function() {
	return this.getAll('Items');
}

Marketplace.prototype.getPromotions = async function() {
	return this.getAll('Promotions');
}

Marketplace.prototype.getManufacturers = async function() {
	return this.getAll('Manufacturers');
}

module.exports = Marketplace;