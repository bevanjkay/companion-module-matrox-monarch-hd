var instance_skel = require('../../instance_skel');
var debug;
var log;
var retryAttempts = 0;

const http = require('http');
const request = require('request');

const ACTIONS = {
	'startStreaming':			{ label: 'Start Streaming',					apiCommand: 'StartStreaming' },
	'startRecording':			{ label: 'Start Recording',					apiCommand: 'StartRecording' },
	'startRecordingStreaming':	{ label: 'Start Recording & Streaming',		apiCommand: 'StartStreamingAndRecording'  },
	'stopStreaming':			{ label: 'Stop Streaming',					apiCommand: 'StopStreaming' },
	'stopRecording':			{ label: 'Stop Recording',					apiCommand: 'StopRecording' },
	'stopRecordingStreaming':	{ label: 'Stop Recording & Streaming',		apiCommand: 'StopStreamingAndRecording'  }
};

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions
	self.init_presets();
	self.init_feedbacks();
	
	return self;
}

instance.prototype.currentState = {
	internal : {},
	dynamicVariables : {},
};

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.stopMatroxStateTimer();
	if (self.config.pollMatrox == 1) {
		self.startMatroxStateTimer();
	} else {
		self.updateVariable('record_status', "N/A");
		self.updateVariable('stream_status', "N/A");
		self.checkFeedbacks('streaming_status');
		self.checkFeedbacks('recording_status');
	}
};

instance.prototype.init = function() {
	var self = this;
	self.status(self.STATE_WARNING, 'Connecting...');

	if (self.config.pollMatrox == 1) {
		self.startMatroxStateTimer();
	} else {
		self.status(self.STATE_WARNING, 'Not polling');
	}

	// self.status(self.STATE_OK);
	debug = self.debug;
	log   = self.log;
	self.initVariables();
};



instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module controls <a href="https://www.matrox.com/video/en/products/monarch_hdx/" target="_new">Matrox Monarch series stream encoding/recording appliances</a>.'
		},
		{
			type: 'textinput',
			id: 'user',
			width: 12,
			label: 'Username'
		},
		{
			type: 'textinput',
			id: 'password',
			width: 12,
			label: 'Password'
		},
		{
			type: 'textinput',
			id: 'host',
			width: 12,
			label: 'IP Address',
			regex: self.REGEX_IP
		},
		{
			type: 'dropdown',
			id: 'pollMatrox',
			label: 'Would you like to request status of Matrox?',
			default: 0,
			choices: [
				{ id: 0, label: 'No'},
				{ id: 1, label: 'Yes'},
			]
		},
		{
			type: 'number',
			id: 'pollingSeconds',
			width: 5,
			label: 'How often would you like to check the Matrox Status? (ms - Default 10000)',
			default: '10000'
		}
	]
};

instance.prototype.destroy = function() {
	var self = this;
	debug("destroy");
	self.stopMatroxStateTimer();
};

instance.prototype.init_presets = function() {
	var self = this;
	var presets = [];

	const white = self.rgb(255, 255, 255);
	const green = self.rgb(42, 167, 69);
	const red   = self.rgb(220, 53, 69);

	presets.push({
		category: 'Commands',
		label: 'Start Encoder/Recorder 1',
		bank: {
			style: 'text',
			text: 'Start Enc 1',
			size: '18',
			color: white,
			bgcolor: green
		},
		actions: [
			{ action: 'startEncoder1' }
		]
	});

	presets.push({
		category: 'Commands',
		label: 'Start Encoder/Recorder 2',
		bank: {
			style: 'text',
			text: 'Start Enc 2',
			size: '18',
			color: white,
			bgcolor: green
		},
		actions: [
			{ action: 'startEncoder2' }
		]
	});

	presets.push({
		category: 'Commands',
		label: 'Start Both Encoder/Recorders',
		bank: {
			style: 'text',
			text: 'Start Both',
			size: '18',
			color: white,
			bgcolor: green
		},
		actions: [
			{ action: 'startEncoder1' },
			{ action: 'startEncoder2' }
		]
	});

	presets.push({
		category: 'Commands',
		label: 'Stop Encoder/Recorder 1',
		bank: {
			style: 'text',
			text: 'Stop Enc 1',
			size: '18',
			color: white,
			bgcolor: red
		},
		actions: [
			{ action: 'stopEncoder1' }
		]
	});

	presets.push({
		category: 'Commands',
		label: 'Stop Encoder/Recorder 2',
		bank: {
			style: 'text',
			text: 'Stop Enc 2',
			size: '18',
			color: white,
			bgcolor: red
		},
		actions: [
			{ action: 'stopEncoder2' }
		]
	});

	presets.push({
		category: 'Commands',
		label: 'Stop Both Encoder/Recorders',
		bank: {
			style: 'text',
			text: 'Stop Both',
			size: '18',
			color: white,
			bgcolor: red
		},
		actions: [
			{ action: 'stopEncoder1' },
			{ action: 'stopEncoder2' }
		]
	});

	self.setPresetDefinitions(presets);
};

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, ACTIONS);
};

instance.prototype.action = function(action) {
	var self = this;
	var apiHost = self.config.host;
	var username = self.config.user;
	var password = self.config.password;
	var apiCommand = ACTIONS[action.action].apiCommand;
	// var requestUrl = `http://${apiHost}/Monarch/syncconnect/sdk.aspx?command=${apiCommand}`
	var requestUrl = `http://${username}:${password}@${apiHost}/Monarch/syncconnect/sdk.aspx?command=${apiCommand}`

	// Configure HTTP client
	var apiRequest = request.defaults({
		auth: {
			user: self.config.user,
			pass: self.config.password
		},
		timeout: 10000
	});

	// Send request
	self.debug('info', 'Starting request to: ' + requestUrl);
		
	apiRequest.get(requestUrl, function (error, response, body) {

		self.debug('info', JSON.stringify(error));
		self.debug('info', JSON.stringify(response));
		self.debug('info', JSON.stringify(body));

		if (error && error.code === 'ENETUNREACH') {
			self.log('error', 'Connection timeout while connecting to ' + apiHost);
			self.status(self.STATUS_ERROR, 'Unreachable');
			return;
		}
		if (error && error.connect === true) {
			self.log('error', 'Read timeout waiting for response from: ' + requestUrl);
			self.status(self.STATUS_ERROR);
			return;
		}
		if (response && (response.statusCode < 200 || response.statusCode > 299)) {
			self.log('error', 'Non-successful response status code: ' + http.STATUS_CODES[response.statusCode]);
			return;
		}

		var retryRegex = /RETRY/
		if (retryRegex.test(JSON.stringify(body))) {
		self.log('info', 'attempting retry');
		if (retryAttempts < 10) {
		setTimeout(function(){ self.action(action); }, 2000);
		retryAttempts++;
		};
		return;
		}	

		self.log('info', 'Success: ' + action.action + JSON.stringify(body));
		retryAttempts = 0;
		
		
	});

	
};


/**
 * Initialize an empty current state.
 */
instance.prototype.emptyCurrentState = function() {
	var self = this;

	// Reinitialize the currentState variable, otherwise this variable (and the module's
	//	state) will be shared between multiple instances of this module.
	self.currentState = {};

	// The internal state of the connection to ProPresenter
	self.currentState.internal = {
		record_status:"N/A",
		stream_status: "N/A"
	};

	// The dynamic variable exposed to Companion
	self.currentState.dynamicVariables = {
		record_status:"N/A",
		stream_status: "N/A"
	};

	
	// Update Companion with the default state if each dynamic variable.
	Object.keys(self.currentState.dynamicVariables).forEach(function(key) {
		self.updateVariable(key, self.currentState.dynamicVariables[key]);
	});

};

instance.prototype.initVariables = function() {
	var self = this;

	var variables = [
		{
			label: 'Current Record Status',
			name:  'record_status'
		},
		{
			label: 'Current Stream Status',
			name:  'stream_status'
		}
	];

	self.setVariableDefinitions(variables);

	// // Initialize the current state and update Companion with the variables.
	self.emptyCurrentState();

};

instance.prototype.updateVariable = function(name, value) {
	var self = this;

	if (self.currentState.dynamicVariables[name] === undefined) {
		self.log('warn', "Variable " + name + " does not exist");
		return;
	}

	self.currentState.dynamicVariables[name] = value;
	self.setVariable(name, value);
};

instance.prototype.init_feedbacks = function() {
	var self = this;

	var feedbacks = {};
	feedbacks['recording_status'] = {
		label: 'Change colors based on record status',
		description: '',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0,255,0)
			},
			{
				type: 'dropdown',
				label: 'Record Status',
				id: 'recordStatus',
				default: 'N/A',
				choices: [
					{ id: 'ON', label: 'ON'},
					{ id: 'READY', label: 'READY'},
				]
			}
		]
	};
	feedbacks['streaming_status'] = {
		label: 'Change colors based on streaming status',
		description: '',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0,255,0)
			},
			{
				type: 'dropdown',
				label: 'Streaming Status',
				id: 'streamingStatus',
				default: 'N/A',
				choices: [
					{ id: 'ON', label: 'ON'},
					{ id: 'READY', label: 'READY'},
				]
			}
		]
	};

	self.setFeedbackDefinitions(feedbacks);
}

instance.prototype.feedback = function(feedback, bank) {
	var self = this;

	if (feedback.type == 'streaming_status') {
		// self.log('debug', `Streaming Status Option: ${feedback.options.streamingStatus}`)
		if (self.currentState.dynamicVariables.stream_status == feedback.options.streamingStatus) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}

	if (feedback.type == 'recording_status') {
		// self.log('debug', `Recording Status Option: ${feedback.options.streamingStatus}`)
		if (self.currentState.dynamicVariables.record_status == feedback.options.recordStatus) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}
}

instance.prototype.startMatroxStateTimer = function() {
	var self = this;
	self.log('debug', self.config.pollingSeconds);
	var interval = 5000;
	if (self.config.pollingSeconds > 2000) {
			interval = self.config.pollingSeconds; }
	if (self.config.pollingSeconds < 2000 ) {
			interval = 2000;
	}

	
	// Stop the timer if it was already running
	// self.stopMatroxStateTimer();

	self.log('info', "Starting ConnectionTimer");
	// Create a reconnect timer to watch the socket. If disconnected try to connect.
	self.reconTimer = setInterval(function() {
		
		self.getMatroxState(interval - 1000);
	
		
	}, interval );

};

/**
 * Stops the reconnection timer.
 */
instance.prototype.stopMatroxStateTimer = function() {
	var self = this;

	self.log('info', "Stopping ConnectionTimer");
	if (self.reconTimer !== undefined) {
		clearInterval(self.reconTimer);
		delete self.reconTimer;
	}

};


instance.prototype.getMatroxState = function(timeout) {



	var self = this;
	var apiHost = self.config.host;
	var username = self.config.user;
	var password = self.config.password;
	// var requestUrl = `http://${apiHost}/Monarch/syncconnect/sdk.aspx?command=${apiCommand}`
	var requestUrl = `http://${username}:${password}@${apiHost}/Monarch/syncconnect/sdk.aspx?command=GetStatus`
	// self.log('debug', `Current Interval: ${interval}`);
	
	// Configure HTTP client
	var apiRequest = request.defaults({
		auth: {
			user: self.config.user,
			pass: self.config.password
		},
		timeout: timeout
	});

	// Send request
	self.debug('info', 'Starting request to: ' + requestUrl);
	apiRequest.get(requestUrl, function (error, response, body) {
		self.debug('info', JSON.stringify(error));
		self.debug('info', JSON.stringify(response));
		self.debug('info', JSON.stringify(body));

		if (error && error.code === 'ENETUNREACH') {
			self.log('error', 'Connection timeout while connecting to ' + apiHost);
			self.status(self.STATUS_ERROR, 'Matrox not found.');
			return;
		}

		if (error && error.connect === true) {
			self.log('error', 'Read timeout waiting for response from: ' + requestUrl);
			return;
		}
		if (response && (response.statusCode < 200 || response.statusCode > 299)) {
			self.log('error', 'Non-successful response status code: ' + http.STATUS_CODES[response.statusCode]);
			return;
		}

		if (response && response.body) {
		
		
		var matroxResponse = JSON.stringify(response.body).split(',');

		self.log('debug', `Matrox replied streaming status: ${matroxResponse[2]}`);
		self.log('debug', `Matrox replied recording status: ${matroxResponse[0].split(':')[1]}`);

		if (matroxResponse[0].split(':')[1]) {
		self.updateVariable('record_status', matroxResponse[0].split(':')[1]);
		};
		if (matroxResponse[2]) {
		self.updateVariable('stream_status', matroxResponse[2]);
		};
		self.checkFeedbacks('streaming_status');
		self.checkFeedbacks('recording_status');

		
		// self.currentState.dynamicVariables['stream_status'] = matroxResponse[2];
		
		// self.debug('info', 'Success: ' + action.action);
		self.status(self.STATE_OK);
		self.debug(response);

		};
	});
	
	


};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
