var mongoose = require('mongoose');
var request = require('request');
var rp = require('request-promise-native');
var ObjectId = mongoose.Schema.Types.ObjectId;
mongoose.Promise = global.Promise;

var itemSchema = new mongoose.Schema({
	sku: {
		type: String,
		index: true,
		unique: true,
		dropDups: true
	},
	upc: String,
	name: String,
	description: String,
	imageURL: String,
	htc: String,
	usPrice: Number,
	canPrice: Number,
	usWholesalePrice: Number,
	canWholesalePrice: Number,
	walmartStock: {
		type: Number,
		default: 0
	},
	amazonStock: {
		type: Number,
		default: 0
	},
	stock: Number, // the total stock from quickbooks
	usStock: Number, // the stock in the us site
	canStock: Number, // the stock in the canadian site
  onSalesOrders: Number,
  onPurchaseOrders: Number,
	catalogId: Number, // this is for 3D Cart, this is the options item number
	catalogIdCan: Number,
	updated: Boolean,
	location: String,
	secondLocation: String,
	barcode: String,
	countryOfOrigin: String,
	htcCode: String,
	listId: String, // need this to modify the item in quickbooks
	editSequence: String, // also need this in order to modify the item in qb
	isOption: Boolean,
	inactive: Boolean,
	hidden: Boolean,
	hasOptions: Boolean,
	optionId: Number,
	optionIdCan: Number,
	onSale: Boolean,
	usSalePrice: Number,
	canSalePrice: Number,
	salePercentage: Number,
	usLink: String,
	canLink: String,
	manufacturerId: Number,
	manufacturerName: String,
	width: Number,
	height: Number,
	length: Number,
	weight: Number,
	size: String,
	categories: [String],
	lastOrderDate: Date,
	needsRestocking: {
		type: Boolean,
		default: false
	},
	orderCount: {
		type: Number,
		default: 0
	},
	cost: Number,
	isBundle: Boolean,
  parent: {
    type: ObjectId,
    ref: 'Item'
  },
  children: [{
    type: ObjectId,
    ref: 'Item'
  }]
}, {
	usePushEach: true
});

itemSchema.methods.updateFromSKUInfo = function(skuInfo, canadian) {
	this.name = skuInfo.Name;
  this.isOption = false;
  this.updated = false;
  this.onSale = skuInfo.OnSale;
  if (canadian == true) {
    this.catalogIdCan = skuInfo.CatalogID;
    this.canPrice = skuInfo.Price;
    this.canSalePrice = skuInfo.SalePrice;
    this.canStock = skuInfo.Stock;
  } else {
    this.catalogId = skuInfo.CatalogID;
    this.usPrice = skuInfo.Price;
    this.usStock = skuInfo.Stock;
    this.usSalePrice = skuInfo.SalePrice;
    this.cost = skuInfo.Cost;
  }
  return this.save();
}

itemSchema.methods.updateFrom3DCart = async function(cartItem, canadian) {
  // common attributes
  this.onSale = cartItem.SKUInfo.OnSale;
  this.description = cartItem.Description;
  this.imageURL = cartItem.MainImageFile;
  this.name = cartItem.SKUInfo.Name;
  this.weight = cartItem.Weight;
  this.manufacturerName = cartItem.ManufacturerName;
  this.hidden = cartItem.Hide;
  
  var categories = [];
  cartItem.CategoryList.forEach(function(category) {
    categories.push(category.CategoryName);
  });
  this.categories = categories;

  if (cartItem.ExtraField8 != '' && cartItem.ExtraField8 != undefined) {
    this.barcode = cartItem.ExtraField8;
  }

  if (cartItem.GTIN) {
  	this.barcode = cartItem.GTIN;
  }

  if (canadian) {
    this.canPrice = cartItem.SKUInfo.Price;
    this.catalogIdCan = cartItem.SKUInfo.CatalogID;
    this.canLink = cartItem.ProductLink;
    this.canStock = cartItem.SKUInfo.Stock;
    this.canWholesalePrice = cartItem.PriceLevel7; // Canadian Wholesale Price
  }
  else {
    this.usPrice = cartItem.SKUInfo.Price;
    this.catalogId = cartItem.SKUInfo.CatalogID;
    this.usLink = cartItem.ProductLink;
    this.manufacturerId = cartItem.ManufacturerID;
    this.usStock = cartItem.SKUInfo.Stock;
    this.usWholesalePrice = cartItem.PriceLevel2; // US Wholesale Price
    this.cost = cartItem.SKUInfo.Cost;
  }

  if (cartItem.AdvancedOptionList.length > 0) {
    this.hasOptions = true;
    this.children = [];

    // save the options
    for (optionItem of cartItem.AdvancedOptionList) {
      var optionSKU = optionItem.AdvancedOptionSufix.trim();
      var parentItem = this;
      if (optionSKU != '') { // a lot of the options are dummy ones
        await this.model('Item').findOne({sku: optionSKU}).exec().then(async function(advancedOption) {
          if (advancedOption) {
            parentItem.children.push(advancedOption._id);
          	await advancedOption.updateAdvancedOptionFields(parentItem, cartItem, optionItem, canadian);
          } else if (optionItem.AdvancedOptionSufix != '') {
            var newOption = new parentItem.constructor(); 
            newOption.isNew = true;
            newOption.sku = optionSKU;
            parentItem.children.push(newOption._id);
            await newOption.updateAdvancedOptionFields(parentItem, cartItem, optionItem, canadian);
          }
        });
      }
    }
  } else {
    this.hasOptions = false;
  }

  if (cartItem.Width != 0) {
    this.width = cartItem.Width;
  }

  if (cartItem.Height != 0) {
    this.length = cartItem.Height;
  }

  return this.save();
}

itemSchema.methods.updateAdvancedOptionFields = function(dbParent, parentItem, optionItem, canadian) {
	console.log(optionItem.AdvancedOptionName);
  this.name = optionItem.AdvancedOptionName;
  if (canadian) {
    this.optionIdCan = optionItem.AdvancedOptionCode;
    this.catalogIdCan = parentItem.SKUInfo.CatalogID; // Parent Item
    this.canPrice = optionItem.AdvancedOptionPrice;
    this.canWholesalePrice = parentItem.PriceLevel7;
    this.canLink = parentItem.ProductLink;
    this.canStock = optionItem.AdvancedOptionStock;
  }
  else {
    this.usPrice = optionItem.AdvancedOptionPrice;
    this.usWholesalePrice = parentItem.PriceLevel2;
    this.catalogId = parentItem.SKUInfo.CatalogID; // Parent Item
    this.optionId = optionItem.AdvancedOptionCode;
    this.usLink = parentItem.ProductLink;
    this.usStock = optionItem.AdvancedOptionStock;
    this.imageURL = parentItem.MainImageFile;
  }

  this.manufacturerName = parentItem.ManufacturerName;
  this.weight = parentItem.Weight;
  this.isOption = true;

  this.parent = dbParent._id;
  return this.save();
}

itemSchema.methods.saveItem = function(item) {
	this.set(item);
	return this.save();
}

// update the stock from quickbooks
itemSchema.methods.setStock = function(stock) {
  if (stock < 0 || stock == NaN) {
    stock = 0;
  }

  var itemIsInactive = false;
  if (this.IsActive == false || this.IsActive == 'false') {
    itemIsInactive = true;
    stock = 0;
  }

  var updated = (this.usStock != stock) || (this.canStock != stock);
  updated = updated || (this.inactive != itemIsInactive);
  if (updated) {
    this.stock = stock;
    this.usStock = stock;
    this.canStock = stock;
    this.amazonStock = stock;
    this.walmartStock = stock;
  }
  this.updated = updated;
  return this.save();
}

itemSchema.methods.updateFromQuickbooks = function(qbItem) {
	function addItemProperties(data) { // don't update the barcode in here anymore
	  if (data.DataExtName == 'Location') {
	    if (this.location != data.DataExtValue) {
	      //this.location = data.DataExtValue;
	      //this.updated = true;
	    }
	  } else if (data.DataExtName == 'Country' || data.DataExtName == 'C Origin') {
	    if (this.countryOfOrigin != data.DataExtValue.toUpperCase()) {
	      this.countryOfOrigin = data.DataExtValue.toUpperCase();
	      this.updated = true;
	    }
	  } else if (data.DataExtName == 'HTC Code') {
	    if (this.htcCode != data.DataExtValue) {
	      this.htcCode = data.DataExtValue;
	      this.updated = true;
	    }
	  } else if (data.DataExtName == 'Location 2') {
	    if (this.secondLocation != data.DataExtValue) {
	      //this.secondLocation = data.DataExtValue;
	      //this.updated = true;
	    }
	  }
	}

	var theStock;
  if (qbItem.QuantityOnSalesOrder) {
    theStock = parseInt(qbItem.QuantityOnHand) - parseInt(qbItem.QuantityOnSalesOrder);
  } else {
    theStock = parseInt(qbItem.QuantityOnHand);
  }

  if (theStock < 0 || theStock == NaN) {
    theStock = 0;
  }

  var itemIsInactive = false;
  if (qbItem.IsActive == false || qbItem.IsActive == 'false') {
    itemIsInactive = true;
    theStock = 0;
  }

  var updated = (this.usStock != theStock) || (this.canStock != theStock);
  updated = updated || (this.inactive != itemIsInactive);

  this.updated = updated;
  this.stock = theStock;
  this.usStock = theStock;
  this.canStock = theStock;
  this.amazonStock = theStock;
  this.walmartStock = theStock;
  this.inactive = itemIsInactive;

  if (qbItem.DataExtRet) {
    if (qbItem.DataExtRet instanceof Array) {
      qbItem.DataExtRet.forEach(function(data) {
        addItemProperties(data, this);
      });
    } else {
      addItemProperties(qbItem.DataExtRet, this);
    }
  }

  if (qbItem.BarCodeValue && this.barcode != qbItem.BarCodeValue) {
    this.barcode = qbItem.BarCodeValue;
  }
  this.listId = qbItem.ListID;
  this.editSequence = qbItem.EditSequence;

  return this.save();
}

itemSchema.methods.getCartItem = function(canadian) { // only valid if the item is not an option
	var cartItem = {
    SKUInfo: {
      SKU: this.sku,
    },
    MFGID: this.sku,
    WarehouseLocation: this.location,
    ExtraField8: this.barcode,
    ExtraField9: this.countryOfOrigin
  };

  if (canadian == true) {
    cartItem.SKUInfo.Stock = this.canStock;
  } else {
    cartItem.SKUInfo.Stock = this.usStock;
  }

  if (this.inactive && !this.hasOptions) {
    cartItem.SKUInfo.Stock = 0;
  }

  return cartItem;
}

itemSchema.methods.findOrders = function() {
  return this.model('Order').find({'items.item': this._id}).populate('customer');
}

itemSchema.methods.refreshFrom3DCart = async function() {
  var canOptions = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+this.catalogIdCan,
    'GET', true);
  var usOptions = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+this.catalogId,
    'GET', false);
  var response = await rp(canOptions);
  var usResponse = await rp(usOptions);
  await this.updateFrom3DCart(response[0], true);
  return this.updateFrom3DCart(usResponse[0], false);
}

// helpers
function get3DCartOptions(url, method, canadian) {
  var options = {
    url: url,
    method: method,
    headers: {
      SecureUrl: 'https://www.ecstasycrafts.' + (canadian ? 'ca' : 'com'),
      PrivateKey: process.env.CART_PRIVATE_KEY,
      Token: canadian ? process.env.CART_TOKEN_CANADA : process.env.CART_TOKEN 
    },
    json: true
  }
  return options;
}

module.exports = mongoose.model('Item', itemSchema);