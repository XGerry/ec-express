var socket = io();
var theDelivery = {};
var manufacturerNames = [];

$(document).ready(e => {
	socket.emit('getManufacturers', true);
	socket.emit('getDeliveries', deliveries => {
		buildDeliverySummaries(deliveries);
		buildDeliveryTable(deliveries);
	});

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

	$('#saveDeliveryButton').click(e => {
		saveDelivery();
		$('#deliveryModal').modal('hide');
	});

	$('#removeDeliveryButton').click(e => {
		var yes = confirm('Are you sure you want to delete this delivery?');
		if (yes) {
			socket.emit('removeDelivery', theDelivery, d => {
				$('#deliveryModal').modal('hide');
				socket.emit('getDeliveries', deliveries => {
					buildDeliverySummaries(deliveries);
					buildDeliveryTable(deliveries);
				});
			});
		}
	});
});

socket.on('getManufacturersFinished', response => {
	manufacturerNames = response.map(x => {return x.ManufacturerName});
	$('#manufacturerSelect').empty();
	manufacturerNames.sort();
	manufacturerNames.forEach(name => {
		$('#manufacturerSelect').append($('<option></option>').prop('value', name).text(name));
	});
});

function populateDeliveryModal(delivery) {
	var theDate = moment(delivery.date).utc();
	theDelivery = delivery;
	if (delivery.name) {
		$('#deliveryTitle').text(delivery.name);
	} else {
		$('#deliveryTitle').text('New Delivery');
	}
	$('#deliveryName').val(delivery.name);
	$('#manufacturerSelect').val(delivery.manufacturer);
	$('#deliveryDate').val(theDate.format('YYYY-MM-DD'));
	$('#deliveryStatus').val(delivery.status);
	$('#poNumber').val(delivery.poNumber);
}

function saveDeliveryFields() {
	theDelivery.name = $('#deliveryName').val();
	theDelivery.status = $('#deliveryStatus').val();
	theDelivery.manufacturer = $('#manufacturerSelect').val();
	theDelivery.date = $('#deliveryDate').val();
	theDelivery.poNumber = $('#poNumber').val();
}

function saveDelivery() {
	saveDeliveryFields();
	console.log(theDelivery);
	socket.emit('saveDelivery', theDelivery, savedDelivery => {
		theDelivery = savedDelivery;
		socket.emit('getDeliveries', deliveries => {
			buildDeliverySummaries(deliveries);
			buildDeliveryTable(deliveries);
		});
	});
}

function buildDeliverySummaries(deliveries) {
	// clear the tables first
	$('#processingTable').empty();
	$('#transitTable').empty();
	$('#inHouseTable').empty();
	$('#doneTable').empty();

	// deliveries should already be sorted by date
	deliveries.forEach(delivery => {
		if (delivery.status == 'processing') {
			addDeliveryRow(delivery, 'processing');
		} else if (delivery.status == 'in-transit') {
			addDeliveryRow(delivery, 'transit');
		} else if (delivery.status == 'in-house') {
			addDeliveryRow(delivery, 'inHouse');
		} else {
			addDeliveryRow(delivery, 'done');
		}
	});

	$('#processingFooter').text($('#processingTable tr').length + ' shipments.');
	$('#transitFooter').text($('#transitTable tr').length + ' shipments.');
	$('#inHouseFooter').text($('#inHouseTable tr').length + ' shipments.');
	$('#doneFooter').text($('#doneTable tr').length + ' shipments.');
}

function addDeliveryRow(delivery, id) {
	var row = $('<tr></tr>');
	var name = $('<td></td>').text(delivery.name);
	var manufacturer = $('<td></td>').text(delivery.manufacturer);
	var deliveryDate = moment(delivery.date).utc();
	var date = $('<td></td>').text(deliveryDate.format('MMM Do'));
	row.append(name);
	row.append(manufacturer);
	row.append(date);
	$('#'+id+'Table').append(row);

	row.click(e => {
		populateDeliveryModal(delivery);
		$('#deliveryModal').modal();
	});
}

function buildDeliveryTable(deliveries) {
	$('#allDeliveryTable').empty();
	deliveries.forEach(delivery => {
		var row = $('<tr></tr>');
		var name = $('<td></td>').text(delivery.name);
		var manufacturer = $('<td></td>').text(delivery.manufacturer);
		var date = $('<td></td>').text(moment(delivery.date).utc().format('MMM Do'));
		var status = $('<td></td>').text(delivery.status);

		row.append(name).append(manufacturer).append(date).append(status);
		$('#allDeliveryTable').append(row);

		row.click(e => {
			populateDeliveryModal(delivery);
			$('#deliveryModal').modal();
		});
	});
}