var mongoose = require('mongoose');
var request = require('request');
var rp = require('request-promise-native');
var moment = require('moment');
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
	countryOfOrigin: {
    type: String,
    default: 'CN'
  },
	htcCode: {
    type: String,
    default: '9503000090'
  },
	listId: String, // need this to modify the item in quickbooks
	editSequence: String, // also need this in order to modify the item in qb
	isOption: Boolean,
	inactive: Boolean,
	hidden: Boolean,
	hasOptions: {
    type: Boolean,
    default: false
  },
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
  discontinued: {
    type: Boolean,
    default: false
  },
  availableForBackorder: {
    type: Boolean,
    default: false
  },
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
  }],
  profitOverTwoWeeks: {
    type: Number,
    default: 0
  },
  profitOverOneMonth: {
    type: Number,
    default: 0
  },
  marketplaceProperties: {
    cost: {
      type: Map,
      of: Number,
      default: {}
    },
    stock: {
      type: Map,
      of: Number,
      default: {}
    },
    price: {
      type: Map,
      of: Number,
      default: {}
    },
    catalogId: {
      type: Map,
      of: Number,
      default: {}
    },
    onSale: {
      type: Map,
      of: Boolean,
      default: {}
    },
    salePrice: {
      type: Map,
      of: Number,
      default: {}
    },
    optionId: {
      type: Map,
      of: Number,
      default: {}
    },
    link: {
      type: Map,
      of: String,
      default: {}
    },
    wholesalePrice: {
      type: Map,
      of: Number,
      default: {}
    },
    availableForBackorder: {
      type: Map,
      of: Boolean,
      default: {}
    }
  },
}, {
	usePushEach: true
});

itemSchema.statics.getUpdatedItems = function() {
  return this.find({updated: true, hasOptions: false, isOption: false});
}

itemSchema.statics.getUpdatedOptions = function() {
  return this.find({isOption: true, inactive: false, updated: true});
}

itemSchema.statics.getBaseOptions = function() {
  return this.find({hasOptions: true}).populate('children');
}

itemSchema.statics.upsertFromMarketplace = async function(cartItem, marketplace) {
  let item = await this.findOne({sku: cartItem.SKUInfo.SKU.trim()});
  if (!item) {
    item = new this();
    item.sku = cartItem.SKUInfo.SKU.trim();
  }
  return item.updateFrom3DCart(cartItem, marketplace);
}

itemSchema.statics.updateFromMarketplaceSKUInfo = async function(skuInfo, marketplace) {
  let item = await this.findOne({sku: skuInfo.SKU.trim()});
  if (!item) {
    item = new this();
    item.sku = skuInfo.SKU.trim();
  }
  return item.updateFromSKUInfo(skuInfo, marketplace);
}

itemSchema.methods.updateFromSKUInfo = function(skuInfo, marketplace) {
	this.name = skuInfo.Name;
  this.isOption = false;

  // set the marketplace properties
  if (skuInfo.Cost > 0) {
    this.marketplaceProperties.cost.set(marketplace._id.toString(), skuInfo.Cost);
  }
  
  this.marketplaceProperties.catalogId.set(marketplace._id.toString(), skuInfo.CatalogID);
  this.marketplaceProperties.price.set(marketplace._id.toString(), skuInfo.Price);
  this.marketplaceProperties.salePrice.set(marketplace._id.toString(), skuInfo.SalePrice);
  this.marketplaceProperties.stock.set(marketplace._id.toString(), skuInfo.Stock);
  this.marketplaceProperties.onSale.set(marketplace._id.toString(), skuInfo.OnSale);

  return this.save();
}


itemSchema.methods.updateFrom3DCart = async function(cartItem, marketplace) {
  // common attributes
  this.onSale = cartItem.SKUInfo.OnSale;
  this.description = cartItem.Description;
  this.imageURL = cartItem.MainImageFile;
  this.name = cartItem.SKUInfo.Name;
  this.weight = cartItem.Weight;
  this.manufacturerName = cartItem.ManufacturerName;
  this.hidden = cartItem.Hide;
  this.availableForBackorder = cartItem.InventoryControl == '2';
  this.manufacturerId = cartItem.ManufacturerID;
  
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

  this.marketplaceProperties.price.set(marketplace._id.toString(), cartItem.SKUInfo.Price);
  this.marketplaceProperties.cost.set(marketplace._id.toString(), cartItem.SKUInfo.Cost);
  this.marketplaceProperties.catalogId.set(marketplace._id.toString(), cartItem.SKUInfo.CatalogID);
  this.marketplaceProperties.link.set(marketplace._id.toString(), cartItem.ProductLink);
  this.marketplaceProperties.stock.set(marketplace._id.toString(), cartItem.SKUInfo.Stock);
  this.marketplaceProperties.wholesalePrice.set(marketplace._id.toString(), cartItem.PriceLevel2);

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
          	await advancedOption.updateAdvancedOptionFields(parentItem, cartItem, optionItem, marketplace);
          } else if (optionItem.AdvancedOptionSufix != '') {
            var newOption = new parentItem.constructor();
            newOption.isNew = true;
            newOption.sku = optionSKU;
            parentItem.children.push(newOption._id);
            await newOption.updateAdvancedOptionFields(parentItem, cartItem, optionItem, marketplace);
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

itemSchema.methods.updateAdvancedOptionFields = function(dbParent, parentItem, optionItem, marketplace) {
  this.name = optionItem.AdvancedOptionName;

  this.marketplaceProperties.optionId.set(marketplace._id.toString(), optionItem.AdvancedOptionCode);
  this.marketplaceProperties.catalogId.set(marketplace._id.toString(), parentItem.SKUInfo.CatalogID);
  this.marketplaceProperties.cost.set(marketplace._id.toString(), parentItem.SKUInfo.Cost);
  this.marketplaceProperties.price.set(marketplace._id.toString(), optionItem.AdvancedOptionPrice);
  this.marketplaceProperties.wholesalePrice.set(marketplace._id.toString(), parentItem.PriceLevel2);
  this.marketplaceProperties.link.set(marketplace._id.toString(), parentItem.ProductLink);
  this.marketplaceProperties.stock.set(marketplace._id.toString(), optionItem.AdvancedOptionStock);

  this.manufacturerName = parentItem.ManufacturerName;
  this.weight = parentItem.Weight;
  this.isOption = true;
  this.availableForBackorder = dbParent.availableForBackorder;

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

  let updated = false;
  for (const [key, value] of this.marketplaceProperties.stock.entries()) {
    if (stock != value) {
      updated = true;
      break;
    }
  }

  if (!updated) {
    updated = stock != this.usStock || stock != this.canStock;
  }

  this.stock = stock;
  
  if (updated) {
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
    this.discontinued = true;
  } else {
    this.discontinued = false;
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
  this.cost = qbItem.PurchaseCost;

  if (qbItem.DataExtRet) {
    if (qbItem.DataExtRet instanceof Array) {
      qbItem.DataExtRet.forEach(function(data) {
        addItemProperties(data, this);
      });
    } else {
      addItemProperties(qbItem.DataExtRet, this);
    }
  }

  if (qbItem.BarCodeValue && (this.barcode != qbItem.BarCodeValue)) {
    this.barcode = qbItem.BarCodeValue;
  }
  this.listId = qbItem.ListID;
  this.editSequence = qbItem.EditSequence;

  return this.save();
}

itemSchema.methods.getCartItem = function() { // only valid if the item is not an option
	var cartItem = {
    SKUInfo: {
      SKU: this.sku,
      Stock: this.stock
    },
    MFGID: this.sku,
    WarehouseLocation: this.location,
    ExtraField9: this.countryOfOrigin,
  };

  if (this.inactive && !this.hasOptions) {
    cartItem.SKUInfo.Stock = 0;
  }

  if (this.discontinued) {
    cartItem.InventoryControl = '1'; // Out of Stock
  }

  if (this.barcode) {
    cartItem.GTIN = this.barcode;
    cartItem.ExtraField8 = this.barcode;
  }

  return cartItem;
}

itemSchema.methods.getOptionURL = async function(marketplace) {
  await this.populate('parent').execPopulate();
  let url = 'Products/' + this.parent.marketplaceProperties.catalogId.get(marketplace._id.toString());
  url += '/AdvancedOptions/' + this.marketplaceProperties.optionId.get(marketplace._id.toString());
  return url;
}

itemSchema.methods.findOrders = function() {
  return this.model('Order').find({'items.item': this._id}).populate('customer').sort('orderDate');
}

itemSchema.methods.calculateSalesMetrics = function() {
  let oneMonthAgo = moment().subtract(1, 'month');
  var theItem = this;
  return this.model('Order').find({'items.item': this._id, orderDate: { $gte: oneMonthAgo}}).then(function (orders) {
    var totalSales = 0;
    var totalCost = 0;
    for (order of orders) {
      for (item of order.items) {
        if (item.item.equals(theItem._id)) {
          var sales = parseFloat(item.price) * parseInt(item.pickedQuantity);
          totalSales += sales;
          if (order.canadian) {
            totalCost += (parseFloat(theItem.cost) * 1.2) * parseInt(item.pickedQuantity); // calculate exchange
          } else {
            totalCost += parseFloat(theItem.cost) * parseInt(item.pickedQuantity);
          }
        }
      }
    }

    var profit = totalSales - totalCost;
    if (isNaN(profit)) {
      profit = 0;
    }

    theItem.profitOverOneMonth = profit;
    return theItem.save();
  });
}

itemSchema.methods.refreshFrom3DCart = async function() {
  let marketplaces = await mongoose.model('Marketplace').find({});
  let item = this;
  marketplaces.forEach(async market => {
    let catalogId = item.marketplaceProperties.catalogId.get(market._id.toString());
    let cartItem = await market.getCart().get('Products/'+catalogId);
    await this.updateFrom3DCart(cartItem[0], market);
  });
  console.log('done.');
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