const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const ObjectId = mongoose.Schema.Types.ObjectId;
const cartMarketplace = require('../cartMarketplace.js');

let manufacturerSchema = new mongoose.Schema({
	name: String,
	cartId: {
		type: Map,
		of: String,
		default: {}
	}
});

manufacturerSchema.statics.getManufacturersFrom3DCart = async function(secureUrl, privateKey, token) {
	let marketplace = new cartMarketplace(secureUrl, privateKey, token);
	let cartObjects = await marketplace.getManufacturers();
	let promises = [];
	cartObjects.forEach(cartManufacturer => {
		promises.push(mongoose.model('Manufacturer').upsertManufacturer(cartManufacturer, marketplace));
	});
	return Promise.all(promises);
}

manufacturerSchema.statics.upsertManufacturer = async function(cartManufacturer, cartMarketplace) {
	let dbManufacturer = await this.findOne({name: cartManufacturer.ManufacturerName}).exec();
	if (dbManufacturer) {
		console.log(dbManufacturer);
		return dbManufacturer.update(cartManufacturer, cartMarketplace);
	} else {
		let newMarketplace = new this();
		newMarketplace.name = cartManufacturer.ManufacturerName;
		return newMarketplace.update(cartManufacturer, cartMarketplace);
	}
}

manufacturerSchema.methods.update = async function(cartManufacturer, cartMarketplace) {
	this.cartId.set(cartMarketplace.token, cartManufacturer.ManufacturerID);
	return this.save();
}

module.exports = mongoose.model('Manufacturer', manufacturerSchema);