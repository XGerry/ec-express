var LocalStrategy = require('passport-local').Strategy;

var User = require('../app/model/user');

module.exports = function (passport) {
	passport.serializeUser(function (user, done) {
		done(null, user.id);
	});

	passport.deserializeUser(function (id, done) {
		User.findById(id, function (err, user) {
			done(err, user);
		})
	});

	passport.use('local-signup', new LocalStrategy({
		usernameField : 'email',
		passwordField : 'password',
		passReqToCallback : true
	}, function (req, email, password, done) {
		process.nextTick(function() {
			User.findOne({
				email : email
			}, function (err, user) {
				if (err) {
					return done(err);
				}

				console.log('trying to create a user');

				if (user) {
					console.log('user already exists');
					return done(null, false, req.flash('signupMessage', 'That email is already in use.'));
				} else {
					console.log('creating new user');
					var newUser = new User();
					newUser.email = email;
					newUser.password = newUser.generateHash(password);

					newUser.save(function(err) {
						if (err) {
							throw err;
						}
						return done(null, newUser);
					});
				}
			});
		});
	}));

	passport.use('local-login', new LocalStrategy({
		usernameField : 'email',
		passwordField : 'password',
		passReqToCallback : true
	}, function(req, email, password, done) {
		User.findOne({email : email}, function(err, user) {
			if (err) {
				return done(err);
			}

			if (!user) {
				return done(null, false, 'No user found.');
			}

			if (!user.validatePassword(password)) {
				return done(null, false, 'Incorrect password.');
			}

			return done(null, user);
		});
	}));
}