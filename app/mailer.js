var nodemailer = require('nodemailer');

function sendMail(firstname, lastname, email, phone, country, subject, message, callback) {
	var transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: 'matt@ecstasycrafts.com',
			pass: process.env.GMAIL_PASS
		}
	});

	var emailContent = 'Customer support request from ' + firstname + ' ' + lastname + '.\n';
	emailContent += 'Email: ' + email + '\n';
	emailContent += 'Phone: ' + phone + '\n';
	emailContent += 'Country: ' + country + '\n';
	emailContent += 'Meesage:\n';
	emailContent += message;

	var mailOptions = {
		from: 'support@ecstasycrafts.com',
		replyTo: email,
		to: 'support@ecstasycrafts.com',
		subject: '[Customer Support] ' + subject + ' from ' + firstname + ' ' + lastname,
		text: emailContent
	};

	transporter.sendMail(mailOptions, function(err, info) {
		callback(err, info);
	});
}

module.exports = {
	sendMail: sendMail
}