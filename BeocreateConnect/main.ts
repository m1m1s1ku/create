/*
Copyright 2018-2020 Bang & Olufsen A/S

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
SOFTWARE.
*/

// BEOCREATE CONNECT
import { app, BrowserWindow, ipcMain, nativeTheme, systemPreferences } from 'electron';

import { Browser, tcp } from "dnssd2";

import { NodeSSH } from 'node-ssh';
import { fetch } from 'cross-fetch';
import { ClientChannel } from 'ssh2';
import { createWindow, refreshProducts, setProductInfo } from './utils';
import { Service } from './beocreate-connect';

let debug = false;
let win: BrowserWindow | null = null;
  
app.on('ready', () => {
	win = createWindow();
	onRefreshProducts();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});

app.on('activate', () => {
	if(win) { return; }
	
	win = createWindow();
});

// DARK / LIGHT MODE
if (process.platform == "darwin" && win) {
	systemPreferences.subscribeNotification(
	  'AppleInterfaceThemeChangedNotification',
	  function theThemeHasChanged () {
		win?.webContents.send('colourSchemeIsDark', nativeTheme.shouldUseDarkColors);
	  }
	)
}
  
// FIND BEOCREATE SYSTEMS
export let browser: {
	on: (eventName: string, callback: (service: Service) => void) => void;
	start: () => void;
	stop: () => void;
	list: () => Service[];
} | null = null;
let startedOnce = false;

export function startDiscovery(once?: boolean) { // Start or restart discovery.
	if (!once || !startedOnce) {
	  	if (!browser) {
		  	browser = new Browser(tcp('beocreate'), {maintain: true});
	
	  		browser?.on('serviceUp', service => discoveryEvent("up", service));
	  		browser?.on('serviceDown', service => discoveryEvent("down", service));
	  		browser?.on('serviceChanged', service => discoveryEvent("changed", service));
	  		browser?.on('error', error => console.log("dnssd error: "+error));
	  	} else {
	  		stopDiscovery();
	  	}

	  	console.log("Starting discovery.");
		browser?.start();
		bonjourProductCount = 0;
		startedOnce = true;
  }
}

export function stopDiscovery() {
	if(!browser) { return; }

	browser.stop();
	products = {};
	bonjourProductCount = 0;

	console.log("Stopping discovery.");

	if (win) {
		win.webContents.send('discoveredProducts', products);
	}
}

export let products: Record<string, Service> = {};
let bonjourProductCount = 0;

function discoveryEvent(event: string, service: Service): void {
	if (debug) {
		console.log(event, new Date(Date.now()).toLocaleString(), service.fullname, service.addresses, service.txt);
	}
	
	if (event == "up" || event == "down") {
		const list = browser?.list() ?? [];

		if (list) {
			refreshProducts(win!, list);
		}

		bonjourProductCount = list ? list.length : 0;
	}
	
	if (event == "changed") {
		if (products[service.fullname]) {
			setProductInfo(service);
			win?.webContents.send('updateProduct', products[service.fullname]);
		}
	}
	
}

ipcMain.on("getAllProducts", (event, arg) => {
	win?.webContents.send('discoveredProducts', products);
});

function onRefreshProducts() {
	startDiscovery(); 
	startManualDiscovery();
}

ipcMain.on("refreshProducts", onRefreshProducts);

function findProduct(name: string) {
	const productKey = Object.keys(products).find(key => {
		const product = products[key];
		if(product.name === name) {
			return key;
		}

		return null;
	});

	return productKey && products[productKey] ? products[productKey] : null;
}

export let clientChannel: ClientChannel | null = null;
export let sshInstance: NodeSSH | null = null;
export let currentRouting: {
	from: string;
	to: string;
} | null = null;

export async function connectSSH() {
	function cleanup () {
		sshInstance?.dispose();
		clientChannel?.close();
		clientChannel = null;
		sshInstance = null;
		currentRouting = null;
		onRefreshProducts();
	}

	if(sshInstance) {
		cleanup();
		return;
	}

	sshInstance = new NodeSSH();

	currentRouting = {
		from: 'AuxBerry',
		to: 'HiFiBerry',
	};

	const source = findProduct(currentRouting.from);
	const destination = findProduct(currentRouting.to);

	const bitrate = "-f S24_LE";
	const codec = "-t wav";
	const samplingRate = "-r 60000";
	const channels = "-c2"

	const audioParams = `${bitrate} ${codec} ${samplingRate} ${channels}`;

	const sourceLocalIP = source?.addresses[0] ?? null;
	
	if(!sourceLocalIP) {
		console.error('Can\'t find source HifiBerry');
		return;
	}

	const destinationLocalIP = destination?.addresses[0] ?? null;

	if(!destinationLocalIP) {
		console.error('Can\'t find destination HifiBerry');
		return;
	}

	// @todo : Add settings to create this command dynamically.
	const username = 'root';
	const password = 'hifiberry';
	const sshKeyFileName = 'rcaberry';
	const lockFileName = 'connected.lock';

	const linkCommand = `arecord -D plughw:0,0 ${audioParams} | ssh -C ${username}@${destinationLocalIP} -i ${sshKeyFileName} aplay ${audioParams}`;
	const killCommand = `killall arecord | rm ${lockFileName}`;
	const lockCommand = `touch ${lockFileName} | echo ${destination?.name} > ${lockFileName}`;
	const isLockedCommand = `cat ${lockFileName}`;

	await sshInstance.connect({
		host: sourceLocalIP,
		username,
		password
	});

	const isLocked = await sshInstance.execCommand(isLockedCommand);
	if(isLocked.stdout) {
		console.warn('Already connected to', isLocked.stdout, 'killing');
		await sshInstance.execCommand(killCommand);
		cleanup();
	} else {
		await sshInstance.execCommand(lockCommand);
		console.warn('Start binding to ', destination?.name, 'from', source?.name);
		await sshInstance.exec(linkCommand, [], {
			onStdout(chunk) {
				console.log('out:', chunk.toString('utf8'));
				onRefreshProducts();
			},
			onStderr(chunk) {
				console.log('err:', chunk.toString('utf8'));
				onRefreshProducts();
			},
			onChannel: (client) => {
				clientChannel = client;
			}
		});
	}
}

ipcMain.on("bindAuxToAMP", (event, arg) => {
	connectSSH();
});

export let manuallyDiscoveredProduct: Service | null = null;
let manualDiscoveryInterval: NodeJS.Timer | null = null;
let manualDiscoveryAddress = "10.0.0.1";

async function discoverProductAtAddress(address: string): Promise<void> {
	if (bonjourProductCount == 0) {
		try {
			const discovery = await fetch('http://'+address+'/product-information/discovery');
			if(discovery.ok) {
				const body = await discovery.json();
				const service = {
					name: body.name, 
					fullname: body.name+"._"+body.serviceType+"._tcp.local.", 
					port: body.advertisePort, 
					addresses: [address], 
					host: address, 
					txt: body.txtRecord, 
					manual: true
				};
	
				if (!manuallyDiscoveredProduct) {
					manuallyDiscoveredProduct = service;
					refreshProducts(win!);
				}
			} else {
				if (manuallyDiscoveredProduct != null) {
					manuallyDiscoveredProduct = null;
					refreshProducts(win!);
				}
			}
		} catch (err) {
			console.error("Manual product discovery unsuccessful", err instanceof Error ? err.message : err);
		}
	} else {
		if (manuallyDiscoveredProduct != null) {
			manuallyDiscoveredProduct = null;
			refreshProducts(win!);
		}
	}
}

export function startManualDiscovery(): void {
	manuallyDiscoveredProduct = null;

	stopManualDiscovery();

	discoverProductAtAddress(manualDiscoveryAddress);
	manualDiscoveryInterval = setInterval(function() {
		discoverProductAtAddress(manualDiscoveryAddress);
	}, 10000);
}

export function stopManualDiscovery(): void {
	if(!manualDiscoveryInterval) {
		return;
	}

	clearInterval(manualDiscoveryInterval);
}