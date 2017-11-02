var socket = io();

$(document).ready(function() {
	$('#walmartButton').click(function() {
		socket.emit('getWalmartFeeds');
	});
});