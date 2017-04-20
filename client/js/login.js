$(document).ready(function() {

});

$('input').keypress(function(e) {
	if (e.which == 13) {
		doLogin(e);
		return false;
	}
});

$('#loginButton').click(doLogin);

function doLogin(event) {
	$.post('/login', $('#loginForm').serialize(), function(response) {
		if (!response.success) {
			$('#message').removeClass('hidden').addClass('alert-warning').text(response.message);
		} else {
			window.location.replace(response.redirect);
		}
	}, 'json');
}