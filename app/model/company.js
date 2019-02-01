const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const ObjectId = mongoose.Schema.Types.ObjectId;

let companySchema = new mongoose.Schema({
  users: [{
    type: ObjectId,
    ref: 'User'
  }],
  name: String,
  marketplaces: [{
    type: ObjectId,
    ref: 'Marketplace'
  }],
  catalogs: [{
    type: ObjectId,
    ref: 'Catalog'
  }],
  vendors: [{
    type: ObjectId,
    ref: 'Vendor'
  }],
  masterMarketplace: {
    type: ObjectId,
    ref: 'Marketplace'
  }
});

companySchema.statics.findByUser = function(userId) {
  return this.find({users: userId});
}

companySchema.statics.createCompany = function(company, userId) {
  let newCompany = new this();
  newCompany.set(company);
  return newCompany.save().then(co => {
    return mongoose.model('Company').updateOne({_id: newCompany._id}, {$addToSet: {users: userId}});
  });
}

module.exports = mongoose.model('Company', companySchema);
