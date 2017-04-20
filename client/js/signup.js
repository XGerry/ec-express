$(document).ready(function() {

});

$('#signupButton').click(function(event) {
	$.post('/signup', $('#signupForm').serialize(), function(response) {
		if (!response.success) {
			$('#message').removeClass('hidden').addClass('alert-warning').text(response.message);
		} else {
			window.location.replace(response.redirect);
		}
	}, 'json');
});