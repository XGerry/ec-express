var nodemailer = require('nodemailer');

function sendMail(firstname, lastname, email, phone, subject, message) {
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
		if (err) {
			console.log(err);
		} else {
			console.log('Email sent: ' + info.response);
		}
	});
}

module.exports = {
	sendMail: sendMail
}