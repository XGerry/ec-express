var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var customOrderSchema = new mongoose.Schema({
	orderId : String,
	customer: Object,
	items: Array,
	comments: String,
	coupon: String,
	discount: {
		type: Number,
		default: 0
	},
	discountType: String,
	discountValue: Number,
	tax: Number,
	shipping: Number,
	shippingMethod: String,
	poNumber: String,
	invoiceNumber: String,
	lastModified: Date,
	createdDate: Date
});

customOrderSchema.methods.buildCartOrder = function() {
  var cartOrder = {
    BillingFirstName: this.customer.firstname,
    BillingLastName: this.customer.lastname,
    BillingAddress: this.customer.billingAddress,
    BillingAddress2: this.customer.billingAddress2,
    BillingCompany: this.customer.companyName,
    BillingCity: this.customer.billingCity,
    BillingState: this.customer.billingState,
    BillingCountry: this.customer.billingCountry,
    BillingZipCode: this.customer.billingZipCode,
    BillingPhoneNumber: this.customer.phone,
    BillingEmail: this.customer.email,
    BillingPaymentMethod: 'On Account',
    BillingPaymentMethodID: '49', // need to look up all of these
    ShipmentList: [{
      ShipmentOrderStatus: 1, // NEW
      ShipmentFirstName: this.customer.shipmentFirstName,
      ShipmentLastName: this.customer.shipmentLastName,
      ShipmentCompany: this.customer.shipmentCompany,
      ShipmentAddress: this.customer.shippingAddress,
      ShipmentAddress2: this.customer.shippingAddress2,
      ShipmentCity: this.customer.shippingCity,
      ShipmentState: this.customer.shippingState,
      ShipmentCountry: this.customer.shippingCountry,
      ShipmentZipCode: this.customer.shippingZipCode,
      ShipmentPhone: this.customer.shipmentPhone
    }],
    OrderItemList: [],
    OrderStatusID: 1 // NEW
  };
  
  let comments = this.comments;
	if (comments != null || comments != '') {
    comments += '\n';
    comments += 'PO: ' + this.poNumber;
  }

  cartOrder.InternalComments = 'Custom Order';
  cartOrder.CustomerComments = comments;
  cartOrder.SalesTax = this.tax;
  cartOrder.ShipmentList[0].ShipmentCost = this.shipping;
  cartOrder.ShipmentList[0].ShipmentMethodName = this.shippingMethod;
  cartOrder.OrderDiscountPromotion = this.discount;

  this.items.forEach(item => {
    var orderItem = buildOrderItem(item, this.customer);
    cartOrder.OrderItemList.push(orderItem);
  });

  return cartOrder;
}

customOrderSchema.methods.update = function(customOrder) {
  let now = new Date();
	this.set(customOrder);
  this.markModified('customer');
  this.markModified('items');
  this.lastModified = now;
  return this.save();
}

function buildOrderItem(item, customer) {
  var quantity = item.quantity;
  var stock = item.stock;

  if (customer.website == 'can') {
    stock = item.canStock;
  } else {
    stock = item.usStock;
  }

  // if (stock < quantity) {
  //   quantity = stock;
  // }
  // if (quantity <= 0) {
  //   quantity = 0;
  // }

  var orderItem = {
    ItemID: item.sku,
    ItemQuantity: quantity,
    ItemUnitPrice: item.salesPrice,
    ItemDescription: item.name,
    ItemUnitStock: stock
  };
  return orderItem;
}

module.exports = mongoose.model('CustomOrder', customOrderSchema);