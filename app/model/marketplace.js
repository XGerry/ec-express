const mongoose = require('mongoose');
const CartMarketplace = require('../cartMarketplace');
mongoose.Promise = global.Promise;
const ObjectId = mongoose.Schema.Types.ObjectId;

let marketplaceSchema = new mongoose.Schema({
	name: String,
	url: String,
	token: String
});

marketplaceSchema.methods.test = async function() {
	let response = await this.getCart().get('Products', {countonly: 1});
	return response;
}

marketplaceSchema.methods.getCart = function() {
	return new CartMarketplace(this.url, process.env.CART_PRIVATE_KEY, this.token);
}

marketplaceSchema.methods.importOrders = async function(timecode) {
  let cartOrders = await this.getCart().getOrders({orderstatus: 1}); // get all the new orders
  return mongoose.model('Order').importOrders(cartOrders, this, timecode);
}

marketplaceSchema.methods.getItems = async function() {
	let marketplace = this;
	let cartItems = await this.getCart().getItems(async function(cartItems) {
		for (let i = 0; i < cartItems.length; i++) {
			await mongoose.model('Item').upsertFromMarketplace(cartItems[i], marketplace);
		}
	});
}

marketplaceSchema.methods.getSKUInfos = async function() {
	let marketplace = this;
	let skuInfos = await this.getCart().getSKUInfo(async function(skuInfos) {
		for (let i = 0; i < skuInfos.length; i++) {
			let item = await mongoose.model('Item').updateFromMarketplaceSKUInfo(skuInfos[i], marketplace);
		}
	});
	return skuInfos.length;
}

marketplaceSchema.methods.updateInventory = async function() {
	let items = await mongoose.model('Item').getUpdatedItems();
	let cart = this.getCart();
	console.log('Saving ' + items.length + ' products to ' + this.name);
	let body = [];
	for (let i = 0; i < items.length; i++) {
		body.push(items[i].getCartItem(this));
	}

	let numOfRequests = Math.ceil(items.length / 100); // can only update 100 items at a time
  console.log('We need to send ' + numOfRequests + ' requests.');
  for (let i = 0; i < numOfRequests; i++) {
    let requestBody = body.slice(i * 100, (i + 1) * 100);
    try {
  		await cart.put('Products', requestBody);
  		console.log('Done ' + (i + 1) + ' requests');
    } catch (err) {
      console.log(options);
    }
  }

  // now save the options
  let options = await mongoose.model('Item').getUpdatedOptions();
	console.log('Saving ' + options.length + ' options to ' + this.name);

	for (let i = 0; i < options.length; i++) {
		let url = await options[i].getOptionURL(this);
		await cart.put(url, {
			AdvancedOptionSufix: option[i].sku,
			AdvancedOptionName: option[i].name,
			AdvancedOptionStock: option[i].stock,
		});
	}

	console.log('Done saving the options.');

	let baseOptions = await mongoose.model('Item').getBaseOptions();

	console.log('found ' + baseOptions.length);
  let cartItems = [];
  for (dbItem of baseOptions) {
    let stock = 0;
    dbItem.children.forEach(option => {
      stock += option.stock;
    });
    let cartItem = {
      SKUInfo: {
        SKU: dbItem.sku,
        Stock: stock
      }
    };
    cartItems.push(cartItem);
  }

  numOfRequests = Math.ceil(cartItems.length / 100);
  console.log('We need to do ' + numOfRequests + ' requests');

  for (let i = 0; i < numOfRequests; i++) {
    let body = cartItems.slice(i * 100, (i + 1) * 100);
    let response = await cart.put('Products', body)
    process.stdout.write('Request number ' + (i + 1)+'\r');
  }
}

module.exports = mongoose.model('Marketplace', marketplaceSchema);