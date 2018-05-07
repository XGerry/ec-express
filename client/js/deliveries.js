var socket = io();
var theDelivery = {};
var manufacturerNames = [];

$(document).ready(e => {
	socket.emit('getManufacturers', true);

	$('#newDeliveryButton').click(e => {
		var now = new Date();
		var newDelivery = {
			name: '',
			status: 'processing',
			manufacturer: manufacturerNames[0],
			date: now,
			purchaseOrders: [],
			comments: []
		};
		populateDeliveryModal(newDelivery);
		$('#deliveryModal').modal();
	});
});

socket.on('getManufacturersFinished', response => {
	manufacturerNames = response.map(x => {return x.ManufacturerName});
	$('#manufacturerSelect').empty();
	manufacturerNames.forEach(name => {
		$('#manufacturerSelect').append($('<option></option>').prop('value', name).text(name));
	});
});

function populateDeliveryModal(delivery) {
	theDelivery = delivery;
	if (delivery.name) {
		$('#deliveryTitle').text(delivery.name);
	} else {
		$('#deliveryTitle').text('New Delivery');
	}
	$('#deliveryName').val(delivery.name);
	$('#manufacturerSelect').val(delivery.manufacturer);
	$('#deliveryDate').val(delivery.date);
	$('#deliveryStatus').val(delivery.status);
}

function saveDeliveryFields() {
	theDelivery.name = $('#deliveryName').val();
	theDelivery.status = $('#deliveryStatus').val();
	theDelivery.manufacturer = $('#manufacturerSelect').val();
	theDelivery.date = $('#deliveryDate').val();
}