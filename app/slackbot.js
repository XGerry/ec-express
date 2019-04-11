let rp = require('request-promise-native');

function orderBot(body) {
	var options = {
		url: 'https://hooks.slack.com/services/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',
		method: 'POST',
		json: true,
		body: body
	};
	return rp(options);
}

module.exports = {
	orderBot: orderBot
};