<template lang="pug">
	p {{message}}
</template>

<script>
	export default {
		name: 'Test',
		data: function() {
			return {
				message: 'Hey'
			}
		}
	}
</script>