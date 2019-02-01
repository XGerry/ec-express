var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');
const ObjectId = mongoose.Schema.Types.ObjectId;
mongoose.Promise = global.Promise;

var userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  username: String,
  password: {
    type: String,
    required: true,
    select: false
  },
  companies: [{
    type: ObjectId,
    ref: 'Company'
  }],
  defaultCompany: {
    type: ObjectId,
    ref: 'Company'
  }
});

userSchema.pre('save', async function() {
  if (this.password) {
    var hash = await bcrypt.hash(this.password, 10);
    this.password = hash;
    console.log('Warning! Changing the user\'s password!');
  }
});

userSchema.statics.authenticate = function(email, password) {
  return this.findOne({email: email}).select('+password').then(user => {
    if (user) {
      return bcrypt.compare(password, user.password).then(success => {
        if (success) {
          return {
            success: true,
            userId: user._id
          }
        } else {
          return {
            success: false,
            error: 'Wrong email or password.'
          }
        }
      });
    } else {
      return {
        success: false,
        error: 'Wrong email or password.'
      }
    }
  });
}

module.exports = mongoose.model('User', userSchema);
