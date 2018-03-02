var socket = io();
var items = [];
var customer = {};

$(document).ready(e => {
	$('#moveOrdersButton').click(e => {
		var doIt = confirm('Are you sure you want to change all the orders?');
		if (doIt) {
			var website = $('#websiteSelect').val();
			var fromStatus = $('#fromStatusSelect').val();
			var toStatus = $('#toStatusSelect').val();
			socket.emit('moveOrders', fromStatus, toStatus, website);
		}
	});
});

