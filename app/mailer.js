var nodemailer = require('nodemailer');

function sendMail(text) {
	var transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: 'matt@ecstasycrafts.com',
			pass: process.env.GMAIL_PASS
		}
	});

	var mailOptions = {
		from: 'matt@ecstasycrafts.com',
		to: 'support@ecstasycrafts.com',
		subject: 'Sending email through Node.js',
		text: text
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