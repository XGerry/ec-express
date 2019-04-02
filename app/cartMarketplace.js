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

Marketplace.prototype.getAll = async function(route, qs, fnc) {
	let query = qs ? qs : {};
	query.countonly = 1;
	let totalCount = await this.get(route, query);

	totalCount = totalCount.TotalCount;
	let numberOfRequests = Math.ceil(totalCount / 200);

	console.log('Found ' + totalCount + ' number of objects from ' + route);
	console.log('Performing ' + numberOfRequests + ' number of requests.');
	delete query.countonly;
	let allObjects = [];
	for (let i = 0; i < numberOfRequests; i++) {
		let query = qs ? qs : {};
		query.limit = 200;
		query.offset = i * 200;
		let items = await this.get(route, query);
		if (fnc) {
			fnc(items);
		}
		allObjects = allObjects.concat(items);
		process.stdout.write((((i+1) / numberOfRequests) * 100).toFixed(2) + '% complete.\r');
	}

	return allObjects;
}

Marketplace.prototype.getItems = function() {
	return this.getAll('Products');
}

Marketplace.prototype.getSKUInfo = function(fnc) {
	return this.getAll('Products/skuinfo', {}, fnc);
}

Marketplace.prototype.getPromotions = async function() {
	return this.getAll('Promotions');
}

Marketplace.prototype.getManufacturers = async function() {
	return this.getAll('Manufacturers');
}

Marketplace.prototype.getCustomer = async function(email) {
	return this.get('Customers', {
		email: email
	});
}

Marketplace.prototype.getOrders = function(qs) {
	return this.getAll('Orders', qs);
}

module.exports = Marketplace;