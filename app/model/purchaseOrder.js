const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const ObjectId = mongoose.Schema.Types.ObjectId;
const _ = require('lodash');

let purchaseOrderSchema = new mongoose.Schema({
	items: [{
		item: {
			type: ObjectId,
			ref: 'Item',
		},
		quantityOrdered: Number,
		quantityReceived: {
      type: Number,
      default: 0
    },
		cost: Number,
	}],
  vendor: {
    type: ObjectId,
    ref: 'Vendor'
  },
  dateOrdered: Date,
  dateReceived: Date,
  status: {
    transit: {
      type: String,
      enum: ['Placed', 'In Transit', 'Delivered'],
      default: 'Placed'
    },
    paid: {
      type: Boolean,
      default: false
    },
    confirmed: {
      type: Boolean,
      default: false
    }
  },
  company: {
    type: ObjectId,
    ref: 'Company'
  }
}, {
	toObject: {
		virtuals: true
	},
	toJSON: {
		virtuals: true
	}
});

purchaseOrderSchema.statics.upsertPO = function(purchaseOrder, company) {
  return this.findOne({_id: purchaseOrder._id}).then(po => {
    if (po) {
      return po.update(purchaseOrder);
    } else {
      return this.newPO(purchaseOrder, company);
    }
  });
}

purchaseOrderSchema.statics.newPO = function(purchaseOrder, company) {
  let newPO = new this();
  newPO.company = company._id;
  newPO.dateOrdered = new Date();
  return newPO.update(purchaseOrder);
}

purchaseOrderSchema.methods.update = function(purchaseOrder) {
  this.set(purchaseOrder);
  return this.save();
}

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);