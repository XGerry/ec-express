var socket = io();

$(document).ready(e => {
	socket.emit('getManufacturers', true);
});

socket.on('getManufacturersFinished', response => {
	console.log(response);
	var manufacturerNames = response.map(x => return x.ManufacturerName);
	
});