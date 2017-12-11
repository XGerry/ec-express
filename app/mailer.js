var nodemailer = require('nodemailer');

function sendSupportMail(firstname, lastname, email, phone, country, subject, message, callback) {
	var emailContent = 'Customer support request from ' + firstname + ' ' + lastname + '.\n';
	emailContent += 'Email: ' + email + '\n';
	emailContent += 'Phone: ' + phone + '\n';
	emailContent += 'Country: ' + country + '\n';
	emailContent += 'Message:\n';
	emailContent += message;

	var mailOptions = {
		from: 'support@ecstasycrafts.com',
		replyTo: email,
		to: 'support@ecstasycrafts.com',
		subject: '[Customer Support] ' + subject + ' from ' + firstname + ' ' + lastname,
		text: emailContent
	};

	sendMail(mailOptions, callback);
}

function sendMail(mailOptions, callback) {
	var transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: 'matt@ecstasycrafts.com',
			pass: process.env.GMAIL_PASS
		}
	});

	transporter.sendMail(mailOptions, function(err, info) {
		callback(err, info);
	});
}

module.exports = {
	sendSupportMail: sendSupportMail,
	sendMail: sendMail
}