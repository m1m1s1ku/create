/*Copyright 2019 Bang & Olufsen A/S
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

// BEOCREATE CLOCK EXTENSION
// Work in UTC. Times will be displayed in local time in the UI.

import { version } from './package.json';
debug = beo.debugMode;

var currentDate = null;
var locale = null;

beo.bus.on('general', function(event) {
	
	if (event.header == "startup") {
		
		syncClock();
		
		if (beo.extensions.network && beo.extensions.network.getCountry) {
			locale = beo.extensions.network.getCountry();
		}
		
	}
	
	if (event.header == "activatedExtension") {
		if (event.content == "clock") {
			beo.sendToUI("clock", {header: "currentTime", content: {timeJSON: currentDate.toJSON(), locale: locale}});
		}
	}
});

var clockSyncTimeout;
function syncClock() {
	currentDate = new Date();
	beo.sendToUI("clock", {header: "currentTime", content: {timeJSON: currentDate.toJSON(), locale: locale}});
	timeUntilNextSync = 60 - currentDate.getSeconds();
	clearTimeout(clockSyncTimeout);
	clockSyncTimeout = setTimeout(function() {
		syncClock();
	}, timeUntilNextSync*1000);
}


module.exports = {
	version: version
};

